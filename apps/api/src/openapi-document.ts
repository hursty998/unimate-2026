import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { contract } from "@unimate/contracts";
import { OpenAPIGenerator } from "@orpc/openapi";
import { ZodToJsonSchemaConverter } from "@orpc/zod/zod4";

const generator = new OpenAPIGenerator({
  schemaConverters: [new ZodToJsonSchemaConverter()],
});

export function getOpenApiOutputPath() {
  return resolve(process.cwd(), "../../docs/generated/openapi.json");
}

export async function buildOpenApiDocument() {
  return generator.generate(contract, {
    info: {
      title: "UniMate API",
      version: "v1",
    },
  });
}

export function serializeOpenApiDocument(document: unknown) {
  return `${JSON.stringify(document, null, 2)}\n`;
}

export async function assertOpenApiDocumentMatches(
  document: unknown,
  outputPath: string,
) {
  let committedDocument: string;
  try {
    committedDocument = await readFile(outputPath, "utf8");
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") {
      throw new Error(
        `Generated OpenAPI document is missing at ${outputPath}. Run \`pnpm openapi:generate\` to create it.`,
        { cause: error },
      );
    }
    throw error;
  }

  if (committedDocument !== serializeOpenApiDocument(document)) {
    throw new Error(
      `Generated OpenAPI document is stale at ${outputPath}. Run \`pnpm openapi:generate\` to regenerate it.`,
    );
  }
}
