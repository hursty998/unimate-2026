import { rm } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const repositoryRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const outputName = process.argv[2];
const workspace = path.resolve(process.cwd());

if (
  !["dist", ".test-dist"].includes(outputName) ||
  workspace === repositoryRoot ||
  !workspace.startsWith(`${repositoryRoot}${path.sep}`)
) {
  throw new Error("Refusing to clean an unapproved TypeScript output path.");
}

await rm(path.join(workspace, outputName), { recursive: true, force: true });
