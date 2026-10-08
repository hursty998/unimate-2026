import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { contract } from "@unimate/contracts";
import { OpenAPIGenerator } from "@orpc/openapi";
import { ZodToJsonSchemaConverter } from "@orpc/zod/zod4";

const generator = new OpenAPIGenerator({
  schemaConverters: [new ZodToJsonSchemaConverter()],
});

const document = await generator.generate(contract, {
  info: {
    title: "UniMate API",
    version: "v1",
  },
});

const outputPath = resolve(process.cwd(), "../../docs/generated/openapi.json");

await mkdir(dirname(outputPath), { recursive: true });
await writeFile(outputPath, `${JSON.stringify(document, null, 2)}\n`, "utf8");
