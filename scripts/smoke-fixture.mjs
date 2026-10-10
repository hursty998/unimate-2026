import { spawnSync } from "node:child_process";
import process from "node:process";
import {
  cleanupLocalSmokeFixture,
  createDatabaseIdentityCleaner,
  createLocalSmokeFixture,
  readLocalSupabaseStatus,
  readSmokeCredentialsFile,
  validateLocalSmokeTarget,
} from "./local-smoke-fixture.mjs";

function run(command, args, label) {
  const result = spawnSync(command, args, {
    cwd: process.cwd(),
    stdio: "inherit",
  });

  if (result.error || result.status !== 0) {
    throw new Error(`${label} failed.`);
  }
}

function getTarget() {
  if (!process.env["DATABASE_URL"] || !process.env["DIRECT_URL"]) {
    throw new Error(
      "Local DATABASE_URL and DIRECT_URL are required; configure packages/database/.env.",
    );
  }

  return validateLocalSmokeTarget({
    supabaseStatus: readLocalSupabaseStatus(),
    databaseUrl: process.env["DATABASE_URL"],
    directUrl: process.env["DIRECT_URL"],
  });
}

async function prepare() {
  const target = getTarget();
  run("pnpm", ["db:check"], "Local database and migration check");
  run(
    "pnpm",
    ["exec", "turbo", "run", "build", "--filter=@unimate/api"],
    "API build",
  );

  const cleanupDatabaseIdentity = await createDatabaseIdentityCleaner(
    target.databaseUrl,
  );
  const fixture = await createLocalSmokeFixture({
    target,
    cleanupDatabaseIdentity,
  });

  try {
    const filePath = await fixture.writeCredentialsFile();
    process.stdout.write(`${filePath}\n`);
  } catch (error) {
    await fixture.cleanup();
    throw error;
  }
}

async function cleanup(filePath) {
  if (!filePath) {
    throw new Error(
      "Pass the private credential-file path printed by `pnpm smoke:fixture:create`.",
    );
  }

  const target = getTarget();
  run(
    "pnpm",
    ["exec", "turbo", "run", "build", "--filter=@unimate/api"],
    "API build",
  );
  const credentials = await readSmokeCredentialsFile(filePath);
  const cleanupDatabaseIdentity = await createDatabaseIdentityCleaner(
    target.databaseUrl,
  );
  await cleanupLocalSmokeFixture({
    target,
    ...credentials,
    cleanupDatabaseIdentity,
    credentialsFile: filePath,
  });
  process.stdout.write(
    "Local synthetic Auth and UniMate identity cleaned up.\n",
  );
}

try {
  const action = process.argv[2];
  if (action === "create") {
    await prepare();
  } else if (action === "cleanup") {
    const filePath = process.argv
      .slice(3)
      .find((argument) => argument !== "--");
    await cleanup(filePath);
  } else {
    throw new Error("Choose either `create` or `cleanup`.");
  }
} catch (error) {
  process.stderr.write(
    `${error instanceof Error ? error.message : "Local smoke fixture operation failed."}\n`,
  );
  process.exitCode = 1;
}
