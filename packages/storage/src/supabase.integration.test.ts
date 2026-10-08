import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import { parseObjectKey } from "./index.js";
import { SupabaseObjectStorage } from "./supabase.js";
import { withSupabaseTestBucket } from "./supabase-test-support.js";

const supabaseUrl = process.env["SUPABASE_TEST_URL"];
const secretKey = process.env["SUPABASE_TEST_SECRET_KEY"];
const bucketName = process.env["SUPABASE_TEST_BUCKET"];

if (
  supabaseUrl === undefined ||
  secretKey === undefined ||
  bucketName === undefined
) {
  throw new Error(
    "Local Supabase URL, secret key, and test bucket are required for the Storage integration test.",
  );
}

test("Supabase Storage accepts scoped upload/read URLs and round-trips one object", async () => {
  await withSupabaseTestBucket(
    { supabaseUrl, secretKey, bucketName },
    async () => {
      const storage = new SupabaseObjectStorage({
        supabaseUrl,
        secretKey,
        bucketName,
      });
      const key = parseObjectKey(`phase7-tests/${randomUUID()}.txt`);
      const content = Buffer.from("synthetic Phase 7 storage integration");
      let uploadMayExist = false;

      try {
        const upload = await storage.createUploadPermission({
          key,
          contentType: "text/plain",
        });
        uploadMayExist = true;
        const uploadResponse = await fetch(upload.url, {
          method: upload.method,
          headers: upload.headers,
          body: content,
        });
        assert.equal(
          uploadResponse.ok,
          true,
          `Signed Storage upload failed with status ${uploadResponse.status}.`,
        );

        const read = await storage.createReadPermission({
          key,
          expiresInSeconds: 60,
        });
        const readResponse = await fetch(read.url);
        assert.equal(
          readResponse.ok,
          true,
          `Signed Storage read failed with status ${readResponse.status}.`,
        );
        assert.deepEqual(
          Buffer.from(await readResponse.arrayBuffer()),
          content,
        );
      } finally {
        if (uploadMayExist) {
          await storage.deleteObject(key);
        }
      }
    },
  );
});
