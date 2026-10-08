import "dotenv/config";
import { URL } from "node:url";
import { spawnSync } from "node:child_process";
import process from "node:process";

for (const name of ["DATABASE_URL", "DIRECT_URL"]) {
  const value = process.env[name];

  if (!value) {
    throw new Error(`${name} is required for the local application reset.`);
  }

  let url;
  try {
    url = new URL(value);
  } catch (cause) {
    throw new Error(`${name} must be a valid PostgreSQL URL.`, { cause });
  }

  if (
    !["postgres:", "postgresql:"].includes(url.protocol) ||
    !["localhost", "127.0.0.1", "::1", "[::1]"].includes(url.hostname)
  ) {
    throw new Error(
      `${name} must target a loopback PostgreSQL host; refusing destructive reset.`,
    );
  }

  if (name === "DIRECT_URL" && url.searchParams.get("schema") !== "app") {
    throw new Error(
      "DIRECT_URL must explicitly select the Prisma-owned app schema; refusing destructive reset.",
    );
  }
}

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
