import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  assertOpenApiDocumentMatches,
  serializeOpenApiDocument,
} from "./openapi-document.js";

const document = {
  openapi: "3.1.0",
  info: { title: "Fixture API", version: "v1" },
  paths: {},
};

test("OpenAPI check passes for the current document and does not rewrite it", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "unimate-openapi-"));
  const outputPath = path.join(directory, "openapi.json");
  const serialized = serializeOpenApiDocument(document);

  try {
    await writeFile(outputPath, serialized, "utf8");
    await assertOpenApiDocumentMatches(document, outputPath);
    assert.equal(await readFile(outputPath, "utf8"), serialized);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("stale OpenAPI check fails with the repair command and leaves output unchanged", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "unimate-openapi-"));
  const outputPath = path.join(directory, "openapi.json");
  const staleDocument = '{"openapi":"stale"}\n';

  try {
    await writeFile(outputPath, staleDocument, "utf8");
    await assert.rejects(
      assertOpenApiDocumentMatches(document, outputPath),
      /Run `pnpm openapi:generate` to regenerate it/,
    );
    assert.equal(await readFile(outputPath, "utf8"), staleDocument);

    await writeFile(outputPath, serializeOpenApiDocument(document), "utf8");
    await assertOpenApiDocumentMatches(document, outputPath);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
