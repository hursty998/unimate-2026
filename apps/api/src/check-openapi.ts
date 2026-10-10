import {
  assertOpenApiDocumentMatches,
  buildOpenApiDocument,
  getOpenApiOutputPath,
} from "./openapi-document.js";

await assertOpenApiDocumentMatches(
  await buildOpenApiDocument(),
  getOpenApiOutputPath(),
);
