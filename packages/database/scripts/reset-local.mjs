import "dotenv/config";
import { spawnSync } from "node:child_process";
import process from "node:process";
import { validateLocalResetUrls } from "../connection-safety.mjs";

validateLocalResetUrls(process.env["DATABASE_URL"], process.env["DIRECT_URL"]);

for (const args of [
  [
    "exec",
    "prisma",
    "migrate",
    "reset",
    "--force",
    "--config",
    "prisma7.config.ts",
  ],
  ["exec", "prisma", "db", "seed", "--config", "prisma7.config.ts"],
]) {
  const result = spawnSync("pnpm", args, { stdio: "inherit" });

  if (result.error) {
    throw result.error;
  }

  if (result.status !== 0) {
    process.exitCode = result.status ?? 1;
    break;
  }
}
