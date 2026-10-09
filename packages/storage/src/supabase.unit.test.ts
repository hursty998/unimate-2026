import assert from "node:assert/strict";
import { test } from "node:test";
import { ObjectStorageError, parseObjectKey, type ObjectKey } from "./index.js";
import { SupabaseObjectStorage } from "./supabase.js";

function jsonResponse(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function storage(fetcher: typeof fetch) {
  return new SupabaseObjectStorage({
    supabaseUrl: "http://127.0.0.1:55321",
    secretKey: "sb_secret_test-only",
    bucketName: "phase7-provider-tests",
    fetcher,
  });
}

test("object keys use relative, traversal-free path segments", () => {
  assert.equal(
    parseObjectKey("phase7-tests/object-1.txt"),
    "phase7-tests/object-1.txt",
  );
  assert.throws(() => parseObjectKey("../object.txt"), /relative/);
  assert.throws(() => parseObjectKey("a//b"), /relative/);
  assert.throws(
    () => parseObjectKey("https://example.test/object"),
    /relative/,
  );
});

test("creates a short-lived signed upload permission without leaking provider response data", async () => {
  let requestUrl = "";
  let requestInit: RequestInit | undefined;
  const fetcher: typeof fetch = async (input, init) => {
    requestUrl = String(input);
    requestInit = init;
    return jsonResponse({
      url: "/object/upload/sign/phase7-provider-tests/phase7-tests/object-1.txt?token=upload-token",
      token: "upload-token",
      path: "phase7-tests/object-1.txt",
    });
  };
  const key = parseObjectKey("phase7-tests/object-1.txt");

  const permission = await storage(fetcher).createUploadPermission({
    key,
    contentType: "text/plain",
  });

  assert.equal(
    requestUrl,
    "http://127.0.0.1:55321/storage/v1/object/upload/sign/phase7-provider-tests/phase7-tests/object-1.txt",
  );
  assert.equal(requestInit?.method, "POST");
  assert.equal(permission.method, "PUT");
  assert.equal(
    permission.url,
    "http://127.0.0.1:55321/storage/v1/object/upload/sign/phase7-provider-tests/phase7-tests/object-1.txt?token=upload-token",
  );
  assert.deepEqual(permission.headers, {
    "content-type": "text/plain",
    "cache-control": "max-age=3600",
    "x-upsert": "false",
  });
  assert.ok(permission.expiresAt.getTime() > Date.now());
  assert.equal(permission.url.includes("sb_secret_test-only"), false);
});

test("creates a signed read permission with a provider-neutral expiry", async () => {
  let requestUrl = "";
  let requestBody: unknown;
  const fetcher: typeof fetch = async (input, init) => {
    requestUrl = String(input);
    requestBody = JSON.parse(String(init?.body));
    return jsonResponse({
      signedURL:
        "/object/sign/phase7-provider-tests/phase7-tests/object-1.txt?token=read-token",
    });
  };
  const permission = await storage(fetcher).createReadPermission({
    key: parseObjectKey("phase7-tests/object-1.txt"),
    expiresInSeconds: 60,
  });

  assert.equal(
    requestUrl,
    "http://127.0.0.1:55321/storage/v1/object/sign/phase7-provider-tests/phase7-tests/object-1.txt",
  );
  assert.deepEqual(requestBody, { expiresIn: 60 });
  assert.equal(
    permission.url,
    "http://127.0.0.1:55321/storage/v1/object/sign/phase7-provider-tests/phase7-tests/object-1.txt?token=read-token",
  );
  assert.ok(permission.expiresAt.getTime() > Date.now());
});

test("reads metadata for one exact object through the private Storage API", async () => {
  let requestUrl = "";
  let requestInit: RequestInit | undefined;
  const fetcher: typeof fetch = async (input, init) => {
    requestUrl = String(input);
    requestInit = init;
    return jsonResponse([
      {
        id: "object-id",
        name: "object-1.txt",
        metadata: { mimetype: "text/plain", size: 42 },
      },
      {
        id: "other-object-id",
        name: "object-1.txt.backup",
        metadata: { mimetype: "text/plain", size: 100 },
      },
    ]);
  };

  const metadata = await storage(fetcher).getObjectMetadata(
    parseObjectKey("foundation-storage-proof/object-1.txt"),
  );

  assert.equal(
    requestUrl,
    "http://127.0.0.1:55321/storage/v1/object/list/phase7-provider-tests",
  );
  assert.equal(requestInit?.method, "POST");
  assert.deepEqual(JSON.parse(String(requestInit?.body)), {
    prefix: "foundation-storage-proof",
    search: "object-1.txt",
    limit: 2,
    offset: 0,
    sortBy: { column: "name", order: "asc" },
  });
  assert.deepEqual(metadata, { contentType: "text/plain", sizeBytes: 42 });
  assert.equal(JSON.stringify(metadata).includes("sb_secret_"), false);
});

test("reports a missing object without turning malformed provider data into absence", async () => {
  const missingStorage = storage(async () => jsonResponse([]));
  assert.equal(
    await missingStorage.getObjectMetadata(
      parseObjectKey("foundation-storage-proof/missing.txt"),
    ),
    null,
  );

  const malformedStorage = storage(async () =>
    jsonResponse({ name: "missing" }),
  );
  await assert.rejects(
    malformedStorage.getObjectMetadata(
      parseObjectKey("foundation-storage-proof/missing.txt"),
    ),
    (error: unknown) =>
      error instanceof ObjectStorageError && error.kind === "invalid-response",
  );
});

test("deletes one object through the documented Storage API", async () => {
  let requestUrl = "";
  let requestInit: RequestInit | undefined;
  const fetcher: typeof fetch = async (input, init) => {
    requestUrl = String(input);
    requestInit = init;
    return jsonResponse({});
  };

  await storage(fetcher).deleteObject(
    parseObjectKey("phase7-tests/object-1.txt"),
  );

  assert.equal(
    requestUrl,
    "http://127.0.0.1:55321/storage/v1/object/phase7-provider-tests",
  );
  assert.equal(requestInit?.method, "DELETE");
  assert.deepEqual(JSON.parse(String(requestInit?.body)), {
    prefixes: ["phase7-tests/object-1.txt"],
  });
});

test("maps provider HTTP failures to UniMate-owned semantics without response leakage", async () => {
  const fetcher: typeof fetch = async () =>
    new Response("internal storage detail", { status: 503 });
  const key: ObjectKey = parseObjectKey("phase7-tests/object-1.txt");
  const client = storage(fetcher);

  await assert.rejects(
    client.createReadPermission({ key, expiresInSeconds: 60 }),
    (error: unknown) =>
      error instanceof ObjectStorageError &&
      error.kind === "unavailable" &&
      error.status === 503 &&
      !error.message.includes("internal storage detail"),
  );
});

test("rejects malformed successful provider responses", async () => {
  const client = storage(async () => jsonResponse({ token: "missing-url" }));

  await assert.rejects(
    client.createUploadPermission({
      key: parseObjectKey("phase7-tests/object-1.txt"),
      contentType: "text/plain",
    }),
    (error: unknown) =>
      error instanceof ObjectStorageError && error.kind === "invalid-response",
  );
});
