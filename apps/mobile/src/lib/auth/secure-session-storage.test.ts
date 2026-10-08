import assert from "node:assert/strict";
import { test } from "node:test";
import {
  createSecureSessionStorage,
  type SecureKeyValueStore,
} from "./secure-session-storage.ts";

class MemorySecureStore implements SecureKeyValueStore {
  readonly values = new Map<string, string>();

  async getItemAsync(key: string): Promise<string | null> {
    return this.values.get(key) ?? null;
  }

  async setItemAsync(key: string, value: string): Promise<void> {
    this.values.set(key, value);
  }

  async deleteItemAsync(key: string): Promise<void> {
    this.values.delete(key);
  }
}

test("persists large UTF-8 sessions as bounded secure values", async () => {
  const secureStore = new MemorySecureStore();
  const storage = createSecureSessionStorage(
    secureStore,
    "unimate-auth-session",
  );
  const session = `${"x".repeat(2_083)}${"🧭".repeat(400)}`;

  await storage.setItem("unimate-auth-session", session);

  const chunks = [...secureStore.values.entries()].filter(
    ([key]) => !key.endsWith(".manifest"),
  );
  assert.ok(chunks.length > 1);
  assert.ok(
    chunks.every(
      ([, value]) => new TextEncoder().encode(value).byteLength <= 1800,
    ),
  );
  assert.equal(await storage.getItem("unimate-auth-session"), session);
});

test("replaces session values and removes stale encrypted chunks", async () => {
  const secureStore = new MemorySecureStore();
  const storage = createSecureSessionStorage(
    secureStore,
    "unimate-auth-session",
  );

  await storage.setItem("unimate-auth-session", "first session".repeat(300));
  const firstGenerationChunkKeys = [...secureStore.values.keys()].filter(
    (key) => !key.endsWith(".manifest"),
  );
  await storage.setItem("unimate-auth-session", "second session");

  assert.ok(
    firstGenerationChunkKeys.every((key) => !secureStore.values.has(key)),
  );
  assert.equal(await storage.getItem("unimate-auth-session"), "second session");

  await storage.removeItem("unimate-auth-session");
  assert.equal(await storage.getItem("unimate-auth-session"), null);
  assert.equal(secureStore.values.size, 0);
});

test("stores auxiliary Supabase auth keys in protected storage", async () => {
  const secureStore = new MemorySecureStore();
  const storage = createSecureSessionStorage(
    secureStore,
    "unimate-auth-session",
  );

  await storage.setItem("unimate-auth-session", "session");
  await storage.setItem(
    "unimate-auth-session-code-verifier",
    "temporary auth flow state",
  );

  assert.equal(
    await storage.getItem("unimate-auth-session-code-verifier"),
    "temporary auth flow state",
  );
  await storage.removeItem("unimate-auth-session-code-verifier");
  assert.equal(await storage.getItem("unimate-auth-session"), "session");
  assert.equal(
    await storage.getItem("unimate-auth-session-code-verifier"),
    null,
  );
});

test("reports an incomplete secure session instead of treating it as signed out", async () => {
  const secureStore = new MemorySecureStore();
  const storage = createSecureSessionStorage(
    secureStore,
    "unimate-auth-session",
  );

  await storage.setItem("unimate-auth-session", "session payload");
  const storedChunkKey = [...secureStore.values.keys()].find(
    (key) => !key.endsWith(".manifest"),
  );
  assert.ok(storedChunkKey);
  await secureStore.deleteItemAsync(storedChunkKey);

  await assert.rejects(
    storage.getItem("unimate-auth-session"),
    /session is incomplete/,
  );
});
