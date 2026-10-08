import { spawn } from "node:child_process";
import { Buffer } from "node:buffer";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { performance } from "node:perf_hooks";
import { fileURLToPath } from "node:url";

const repositoryRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const maximumTailLines = 150;
const maximumTailCharacters = 20_000;

const fullSteps = [
  { name: "format", command: "pnpm", args: ["format:check"] },
  { name: "tooling tests", command: "pnpm", args: ["test:tooling"] },
  {
    name: "lint/typecheck/build/tests",
    command: "pnpm",
    args: [
      "exec",
      "turbo",
      "run",
      "lint",
      "lint:root",
      "typecheck",
      "build",
      "test",
      "--output-logs=errors-only",
    ],
  },
  {
    name: "OpenAPI",
    command: "pnpm",
    args: ["openapi:generate:prepared"],
  },
  {
    name: "database check",
    command: "pnpm",
    args: ["db:check:prepared"],
  },
  {
    name: "database integration",
    command: "pnpm",
    args: ["db:test:prepared"],
  },
  {
    name: "authentication integration",
    command: "pnpm",
    args: ["auth:test:prepared"],
  },
  {
    name: "authorization integration",
    command: "pnpm",
    args: ["authorization:test:prepared"],
  },
];

const changedSteps = [
  { name: "format", command: "pnpm", args: ["format:check"] },
  { name: "tooling tests", command: "pnpm", args: ["test:tooling"] },
  {
    name: "affected lint/typecheck/build/tests",
    command: "pnpm",
    args: [
      "exec",
      "turbo",
      "run",
      "lint",
      "lint:root",
      "typecheck",
      "build",
      "test",
      "--affected",
      "--output-logs=errors-only",
    ],
  },
];

function commandLabel(command, args) {
  return [command, ...args]
    .map((part) => (/\s/.test(part) ? JSON.stringify(part) : part))
    .join(" ");
}

function formatDuration(milliseconds) {
  return `${(milliseconds / 1000).toFixed(1)}s`;
}

function getExitCode({ code, signal, error }) {
  if (typeof code === "number") {
    return code;
  }

  if (signal && os.constants.signals[signal]) {
    return 128 + os.constants.signals[signal];
  }

  return error ? 127 : 1;
}

async function runStep(
  step,
  { cwd, logDirectory, verbose, stdout, stderr },
  index,
) {
  const slug = step.name.toLowerCase().replace(/[^a-z0-9]+/g, "-");
  const logPath = path.join(
    logDirectory,
    `${String(index + 1).padStart(2, "0")}-${slug}.log`,
  );
  const chunks = [];
  const child = spawn(step.command, step.args, {
    cwd,
    env: process.env,
    stdio: ["ignore", "pipe", "pipe"],
  });

  child.stdout.on("data", (chunk) => {
    chunks.push(Buffer.from(chunk));
    if (verbose) {
      stdout.write(chunk);
    }
  });
  child.stderr.on("data", (chunk) => {
    chunks.push(Buffer.from(chunk));
    if (verbose) {
      stderr.write(chunk);
    }
  });

  const processResult = await new Promise((resolve) => {
    let settled = false;

    child.once("error", (error) => {
      if (!settled) {
        settled = true;
        resolve({ code: null, signal: null, error });
      }
    });
    child.once("close", (code, signal) => {
      if (!settled) {
        settled = true;
        resolve({ code, signal, error: undefined });
      }
    });
  });

  if (processResult.error) {
    chunks.push(
      Buffer.from(
        `Could not start ${commandLabel(step.command, step.args)}: ${processResult.error.message}\n`,
      ),
    );
  }

  await writeFile(logPath, Buffer.concat(chunks));

  return {
    ...processResult,
    exitCode: getExitCode(processResult),
    logPath,
  };
}

function outputTail(text) {
  let lines = text.split(/\r?\n/).slice(-maximumTailLines);
  let tail = lines.join("\n");

  if (tail.length > maximumTailCharacters) {
    tail = tail.slice(-maximumTailCharacters);
    lines = tail.split(/\r?\n/);
  }

  return { text: tail, lineCount: lines.length };
}

export async function runVerification(
  steps,
  {
    cwd = repositoryRoot,
    logDirectoryParent = os.tmpdir(),
    mode = "VERIFY",
    verbose = false,
    stdout = process.stdout,
    stderr = process.stderr,
  } = {},
) {
  const startedAt = performance.now();
  const logDirectory = await mkdtemp(
    path.join(logDirectoryParent, "unimate-verify-"),
  );

  for (const [index, step] of steps.entries()) {
    const stepStartedAt = performance.now();
    const result = await runStep(
      step,
      { cwd, logDirectory, verbose, stdout, stderr },
      index,
    );
    const duration = formatDuration(performance.now() - stepStartedAt);

    if (result.exitCode === 0) {
      stdout.write(`✓ ${step.name.padEnd(34)} ${duration}\n`);
      continue;
    }

    const log = await readFile(result.logPath, "utf8");
    const tail = outputTail(log);
    const command = commandLabel(step.command, step.args);

    stdout.write(
      `\n--- Failure output (last ${tail.lineCount} lines, bounded) ---\n`,
    );
    stdout.write(tail.text);
    if (!tail.text.endsWith("\n")) {
      stdout.write("\n");
    }
    stdout.write(
      `\n${mode} FAILED\n\nStep: ${step.name}\nCommand: ${command}\nExit code: ${result.exitCode}\nFull log: ${result.logPath}\n`,
    );

    return {
      exitCode: result.exitCode,
      failedStep: step.name,
      logPath: result.logPath,
      logDirectory,
      duration: performance.now() - startedAt,
    };
  }

  const duration = performance.now() - startedAt;
  await rm(logDirectory, { recursive: true, force: true });
  stdout.write(`\n${mode} PASSED ${formatDuration(duration)}\n`);

  return { exitCode: 0, duration };
}

async function main() {
  const args = process.argv.slice(2);
  const validArguments = new Set(["--changed", "--verbose"]);
  if (args.some((argument) => !validArguments.has(argument))) {
    process.stderr.write(
      "Usage: node scripts/verify.mjs [--changed] [--verbose]\n",
    );
    process.exitCode = 2;
    return;
  }

  const changed = args.includes("--changed");
  const result = await runVerification(changed ? changedSteps : fullSteps, {
    mode: changed ? "VERIFY:CHANGED" : "VERIFY",
    verbose: args.includes("--verbose"),
  });
  process.exitCode = result.exitCode;
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : "";
if (invokedPath === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    process.stderr.write(
      `VERIFY FAILED\n\nStep: verification runner\nCommand: node scripts/verify.mjs\nExit code: 1\nDetails: ${error instanceof Error ? error.message : "Unknown runner error"}\n`,
    );
    process.exitCode = 1;
  });
}
