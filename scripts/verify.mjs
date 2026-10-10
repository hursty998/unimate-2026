import { spawn } from "node:child_process";
import { Buffer } from "node:buffer";
import { createWriteStream } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { performance } from "node:perf_hooks";
import { StringDecoder } from "node:string_decoder";
import { finished } from "node:stream/promises";
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
  { name: "secret check", command: "pnpm", args: ["secrets:check"] },
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
    name: "storage-proof integration",
    command: "pnpm",
    args: ["storage-proof:test:prepared"],
  },
  {
    name: "push registration integration",
    command: "pnpm",
    args: ["push:test:prepared"],
  },
  {
    name: "authorization integration",
    command: "pnpm",
    args: ["authorization:test:prepared"],
  },
  {
    name: "provider integration",
    command: "pnpm",
    args: ["providers:test:prepared"],
  },
  {
    name: "worker integration",
    command: "pnpm",
    args: ["worker:test:prepared"],
  },
  {
    name: "observability integration",
    command: "pnpm",
    args: ["observability:test:prepared"],
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

function retainTail(current, addition) {
  const lines = `${current}${addition}`.split(/\r?\n/);
  let tail = lines.slice(-maximumTailLines).join("\n");

  if (tail.length > maximumTailCharacters) {
    tail = tail.slice(-maximumTailCharacters);
    const firstCompleteLine = tail.indexOf("\n");
    if (firstCompleteLine !== -1) {
      tail = tail.slice(firstCompleteLine + 1);
    }
  }

  return tail;
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
  const logStream = createWriteStream(logPath, { flags: "wx" });
  const child = spawn(step.command, step.args, {
    cwd,
    env: process.env,
    stdio: ["ignore", "pipe", "pipe"],
  });
  let tail = "";
  let logWriteError;
  let childError;
  const logCompletion = finished(logStream);
  logCompletion.catch((error) => {
    logWriteError = error;
    child.kill();
  });

  for (const [source, target] of [
    [child.stdout, stdout],
    [child.stderr, stderr],
  ]) {
    const decoder = new StringDecoder("utf8");
    let logBlocked = false;
    let targetBlocked = false;
    const resumeWhenDrained = () => {
      if (!logBlocked && !targetBlocked) {
        source.resume();
      }
    };

    source.on("data", (chunk) => {
      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      tail = retainTail(tail, decoder.write(buffer));

      if (!logWriteError && !logStream.destroyed) {
        if (!logStream.write(buffer)) {
          logBlocked = true;
          source.pause();
          logStream.once("drain", () => {
            logBlocked = false;
            resumeWhenDrained();
          });
        }
      }

      if (verbose && !target.write(buffer)) {
        targetBlocked = true;
        source.pause();
        target.once("drain", () => {
          targetBlocked = false;
          resumeWhenDrained();
        });
      }
    });

    source.once("end", () => {
      tail = retainTail(tail, decoder.end());
    });
  }

  child.once("error", (error) => {
    childError = error;
  });

  const processResult = await new Promise((resolve) => {
    child.once("close", (code, signal) => {
      resolve({ code, signal, error: childError });
    });
  });

  if (processResult.error) {
    const message = `Could not start ${commandLabel(step.command, step.args)}: ${processResult.error.message}\n`;
    const buffer = Buffer.from(message);
    tail = retainTail(tail, message);
    if (!logWriteError && !logStream.destroyed) {
      logStream.write(buffer);
    }
    if (verbose) {
      stderr.write(buffer);
    }
  }

  logStream.end();
  try {
    await logCompletion;
  } catch (error) {
    throw new Error(
      `Could not finish verification log ${logPath}: ${error.message}`,
      {
        cause: error,
      },
    );
  }

  const lines = tail.split(/\r?\n/);
  return {
    ...processResult,
    exitCode: getExitCode(processResult),
    logPath,
    tail,
    tailLineCount: lines.length,
  };
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

    const command = commandLabel(step.command, step.args);

    stdout.write(
      `\n--- Failure output (last ${result.tailLineCount} lines, bounded) ---\n`,
    );
    stdout.write(result.tail);
    if (!result.tail.endsWith("\n")) {
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
