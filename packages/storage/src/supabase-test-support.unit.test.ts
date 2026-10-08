import assert from "node:assert/strict";
import { test } from "node:test";
import { withSupabaseTestBucket } from "./supabase-test-support.js";

const options = {
  supabaseUrl: "http://127.0.0.1:55321",
  secretKey: "sb_secret_test-only",
  bucketName: "phase7-provider-tests",
};

test("refuses to use an existing public Storage test bucket", async () => {
  let runCalled = false;
  const fetcher: typeof fetch = async () =>
    new Response(JSON.stringify([{ id: options.bucketName, public: true }]), {
      status: 200,
      headers: { "content-type": "application/json" },
    });

  await assert.rejects(
    withSupabaseTestBucket({ ...options, fetcher }, async () => {
      runCalled = true;
    }),
    /must be private/,
  );
  assert.equal(runCalled, false);
});

test("uses an existing private Storage test bucket without deleting it", async () => {
  const methods: string[] = [];
  const fetcher: typeof fetch = async (_input, init) => {
    methods.push(init?.method ?? "GET");
    return new Response(
      JSON.stringify([{ id: options.bucketName, public: false }]),
      {
        status: 200,
        headers: { "content-type": "application/json" },
      },
    );
  };

  await withSupabaseTestBucket({ ...options, fetcher }, async () => undefined);

  assert.deepEqual(methods, ["GET"]);
});
