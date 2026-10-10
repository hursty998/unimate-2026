import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import {
  buildOpenApiDocument,
  getOpenApiOutputPath,
  serializeOpenApiDocument,
} from "./openapi-document.js";

const outputPath = getOpenApiOutputPath();
await mkdir(dirname(outputPath), { recursive: true });
await writeFile(
  outputPath,
  serializeOpenApiDocument(await buildOpenApiDocument()),
  "utf8",
);
