import assert from "node:assert/strict";
import { test } from "node:test";
import { validateCredentialEndpointUrl } from "./endpoint-url.ts";

test("accepts remote HTTPS endpoints in development and production", () => {
  assert.equal(
    validateCredentialEndpointUrl(
      "https://api.unimate.example",
      "EXPO_PUBLIC_API_URL",
      true,
    ),
    "https://api.unimate.example",
  );
  assert.equal(
    validateCredentialEndpointUrl(
      "https://auth.unimate.example",
      "EXPO_PUBLIC_SUPABASE_URL",
      false,
    ),
    "https://auth.unimate.example",
  );
});

test("allows loopback HTTP only in development", () => {
  assert.equal(
    validateCredentialEndpointUrl(
      "http://127.0.0.1:55321",
      "EXPO_PUBLIC_SUPABASE_URL",
      true,
    ),
    "http://127.0.0.1:55321",
  );
  assert.throws(
    () =>
      validateCredentialEndpointUrl(
        "http://127.0.0.1:55321",
        "EXPO_PUBLIC_SUPABASE_URL",
        false,
      ),
    /must use HTTPS/,
  );
});

test("allows Android emulator and private LAN HTTP endpoints in development", () => {
  assert.equal(
    validateCredentialEndpointUrl(
      "http://10.0.2.2:3000",
      "EXPO_PUBLIC_API_URL",
      true,
    ),
    "http://10.0.2.2:3000",
  );
  assert.equal(
    validateCredentialEndpointUrl(
      "http://192.168.1.40:55321",
      "EXPO_PUBLIC_SUPABASE_URL",
      true,
    ),
    "http://192.168.1.40:55321",
  );
});

test("rejects remote plaintext HTTP even during development", () => {
  assert.throws(
    () =>
      validateCredentialEndpointUrl(
        "http://auth.example.com",
        "EXPO_PUBLIC_SUPABASE_URL",
        true,
      ),
    /must use HTTPS/,
  );
});

test("rejects endpoint paths, credentials, queries, and invalid URLs", () => {
  for (const value of [
    "https://api.unimate.example/v1",
    "https://user:password@api.unimate.example",
    "https://api.unimate.example?debug=true",
    "not-a-url",
  ]) {
    assert.throws(() =>
      validateCredentialEndpointUrl(value, "EXPO_PUBLIC_API_URL", false),
    );
  }
});
