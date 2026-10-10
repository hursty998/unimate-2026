import { spawn } from "node:child_process";
import { Buffer } from "node:buffer";
import { createWriteStream } from "node:fs";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
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

export const fullSteps = [
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
    name: "production runtime artifacts",
    command: "node",
    args: ["scripts/runtime-artifacts.mjs"],
  },
  {
    name: "OpenAPI",
    command: "pnpm",
    args: ["openapi:check:prepared"],
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

export const changedSteps = [
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
  if (error) {
    return 127;
  }

  if (typeof code === "number") {
    return code;
  }

  if (signal && os.constants.signals[signal]) {
    return 128 + os.constants.signals[signal];
  }

  return 1;
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
  { cwd, logDirectory, verbose, stdout, stderr, execution },
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
  execution.child = child;
  if (execution.signal) {
    child.kill(execution.signal);
  }
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
      if (execution.child === child) {
        execution.child = undefined;
      }
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
    const logError = new Error(
      `Could not finish verification log ${logPath}: ${error.message}`,
      {
        cause: error,
      },
    );
    logError.logPath = logPath;
    throw logError;
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

function reportStep(step, status = "not_run", durationMs = 0, exitCode = null) {
  return { name: step.name, status, durationMs, exitCode };
}

function makeReport({ mode, status, durationMs, steps, failedStep, logPath }) {
  const report = {
    schemaVersion: 1,
    mode,
    status,
    durationMs: Math.round(durationMs),
    steps,
  };

  if (status === "failed") {
    report.failedStep = failedStep;
    if (logPath) {
      report.failureLogPath = logPath;
    }
  }

  return report;
}

async function writeJsonReport(reportPath, report, stderr) {
  if (!reportPath) {
    return undefined;
  }

  const outputPath = path.resolve(reportPath);
  try {
    await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, {
      encoding: "utf8",
      mode: 0o600,
    });
    return undefined;
  } catch (error) {
    const message = `Could not write JSON verification report ${outputPath}: ${error.message}\n`;
    stderr.write(message);
    return message;
  }
}

export async function runVerification(
  steps,
  {
    cwd = repositoryRoot,
    logDirectoryParent = os.tmpdir(),
    mode = "VERIFY",
    reportMode = "full",
    reportPath,
    verbose = false,
    stdout = process.stdout,
    stderr = process.stderr,
  } = {},
) {
  const startedAt = performance.now();
  const execution = { child: undefined, signal: undefined };
  const handleInterrupt = (signal) => {
    execution.signal ??= signal;
    execution.child?.kill(signal);
  };
  const onSigint = () => handleInterrupt("SIGINT");
  const onSigterm = () => handleInterrupt("SIGTERM");
  const stepResults = steps.map((step) => reportStep(step));
  let logDirectory;
  let failure;

  process.on("SIGINT", onSigint);
  process.on("SIGTERM", onSigterm);

  try {
    logDirectory = await mkdtemp(
      path.join(logDirectoryParent, "unimate-verify-"),
    );

    for (const [index, step] of steps.entries()) {
      if (execution.signal) {
        const signalExitCode = 128 + os.constants.signals[execution.signal];
        failure = {
          stepName: "verification interrupted",
          command: "node scripts/verify.mjs",
          exitCode: signalExitCode,
          tail: `Verification interrupted by ${execution.signal}.\n`,
        };
        break;
      }

      const stepStartedAt = performance.now();
      let result;
      try {
        result = await runStep(
          step,
          { cwd, logDirectory, verbose, stdout, stderr, execution },
          index,
        );
      } catch (error) {
        result = {
          exitCode: 1,
          logPath: error.logPath,
          tail: `${error.message}\n`,
          tailLineCount: 1,
        };
      }
      const durationMs = Math.round(performance.now() - stepStartedAt);
      const exitCode = execution.signal
        ? 128 + os.constants.signals[execution.signal]
        : result.exitCode;
      stepResults[index] = reportStep(
        step,
        exitCode === 0 ? "passed" : "failed",
        durationMs,
        exitCode,
      );

      if (exitCode === 0) {
        stdout.write(
          `✓ ${step.name.padEnd(34)} ${formatDuration(durationMs)}\n`,
        );
        continue;
      }

      failure = {
        stepName: step.name,
        command: commandLabel(step.command, step.args),
        exitCode,
        logPath: result.logPath,
        tail: result.tail,
        tailLineCount: result.tailLineCount,
      };
      break;
    }

    if (!failure && execution.signal) {
      failure = {
        stepName: "verification interrupted",
        command: "node scripts/verify.mjs",
        exitCode: 128 + os.constants.signals[execution.signal],
        tail: `Verification interrupted by ${execution.signal}.\n`,
      };
    }

    if (!failure) {
      try {
        await rm(logDirectory, { recursive: true, force: true });
      } catch (error) {
        failure = {
          stepName: "verification log cleanup",
          command: "remove temporary verification logs",
          exitCode: 1,
          tail: `Could not remove verification logs ${logDirectory}: ${error.message}\n`,
          tailLineCount: 1,
        };
      }
    }

    const duration = performance.now() - startedAt;
    if (failure) {
      if (failure.tail) {
        stdout.write(
          `\n--- Failure output (last ${failure.tailLineCount ?? 1} lines, bounded) ---\n`,
        );
        stdout.write(failure.tail);
        if (!failure.tail.endsWith("\n")) {
          stdout.write("\n");
        }
      }
      stdout.write(
        `\n${mode} FAILED\n\nStep: ${failure.stepName}\nCommand: ${failure.command}\nExit code: ${failure.exitCode}\n`,
      );
      if (failure.logPath) {
        stdout.write(`Full log: ${failure.logPath}\n`);
      } else if (logDirectory) {
        stdout.write(`Full logs: ${logDirectory}\n`);
      }

      const report = makeReport({
        mode: reportMode,
        status: "failed",
        durationMs: duration,
        steps: stepResults,
        failedStep: failure.stepName,
        logPath: failure.logPath,
      });
      const reportWriteError = await writeJsonReport(
        reportPath,
        report,
        stderr,
      );
      return {
        exitCode: failure.exitCode,
        failedStep: failure.stepName,
        logPath: failure.logPath,
        logDirectory,
        duration,
        reportWriteError,
      };
    }

    const report = makeReport({
      mode: reportMode,
      status: "passed",
      durationMs: duration,
      steps: stepResults,
    });
    const reportWriteError = await writeJsonReport(reportPath, report, stderr);
    if (reportWriteError) {
      stdout.write(
        `\n${mode} FAILED\n\nStep: verification report\nCommand: write JSON report\nExit code: 1\n`,
      );
      return { exitCode: 1, duration, reportWriteError };
    }

    stdout.write(`\n${mode} PASSED ${formatDuration(duration)}\n`);
    return { exitCode: 0, duration };
  } finally {
    process.off("SIGINT", onSigint);
    process.off("SIGTERM", onSigterm);
  }
}

export function parseVerificationArguments(args) {
  let changed = false;
  let verbose = false;
  let reportPath;

  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === "--changed") {
      changed = true;
    } else if (argument === "--verbose") {
      verbose = true;
    } else if (argument === "--report-json") {
      const value = args[index + 1];
      if (!value || value.startsWith("--") || reportPath) {
        throw new Error(
          "Option --report-json requires one output path and may be specified only once.",
        );
      }
      reportPath = value;
      index += 1;
    } else {
      throw new Error(`Unknown verification argument: ${argument}`);
    }
  }

  return { changed, verbose, reportPath };
}

async function main() {
  let parsedArguments;
  try {
    parsedArguments = parseVerificationArguments(process.argv.slice(2));
  } catch (error) {
    process.stderr.write(
      `${error.message}\nUsage: node scripts/verify.mjs [--changed] [--verbose] [--report-json <path>]\n`,
    );
    process.exitCode = 2;
    return;
  }

  const { changed, verbose, reportPath } = parsedArguments;
  const steps = changed ? changedSteps : fullSteps;
  const selectedMode = changed ? "VERIFY:CHANGED" : "VERIFY";
  try {
    const result = await runVerification(steps, {
      mode: selectedMode,
      reportMode: changed ? "changed" : "full",
      reportPath,
      verbose,
    });
    process.exitCode = result.exitCode;
  } catch (error) {
    process.stderr.write(
      `VERIFY FAILED\n\nStep: verification runner\nCommand: node scripts/verify.mjs\nExit code: 1\nDetails: ${error instanceof Error ? error.message : "Unknown runner error"}\n`,
    );
    if (reportPath) {
      const selectedSteps = steps.map((step) => reportStep(step));
      const report = makeReport({
        mode: changed ? "changed" : "full",
        status: "failed",
        durationMs: 0,
        steps: selectedSteps,
        failedStep: "verification runner",
      });
      await writeJsonReport(reportPath, report, process.stderr);
    }
    process.exitCode = 1;
  }
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
