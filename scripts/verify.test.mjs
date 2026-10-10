import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { clearTimeout, setTimeout } from "node:timers";
import test from "node:test";
import { URL } from "node:url";
import { parseVerificationArguments, runVerification } from "./verify.mjs";

function captureOutput() {
  let value = "";

  return {
    stream: {
      write(chunk) {
        value += chunk.toString();
        return true;
      },
    },
    read: () => value,
  };
}

test("successful child steps report PASS without streaming their logs", async () => {
  const tempRoot = await mkdtemp(
    path.join(os.tmpdir(), "unimate-verify-test-"),
  );
  const output = captureOutput();
  const error = captureOutput();

  try {
    const result = await runVerification(
      [
        {
          name: "tiny success",
          command: process.execPath,
          args: [
            "-e",
            "process.stdout.write('hidden success log'); process.stderr.write('hidden success error')",
          ],
        },
      ],
      {
        cwd: tempRoot,
        logDirectoryParent: tempRoot,
        stdout: output.stream,
        stderr: error.stream,
      },
    );

    assert.equal(result.exitCode, 0);
    assert.match(output.read(), /✓ tiny success/);
    assert.match(output.read(), /VERIFY PASSED/);
    assert.equal(output.read().includes("hidden success log"), false);
    assert.equal(error.read().includes("hidden success error"), false);
    assert.deepEqual(await readdir(tempRoot), []);
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
});

test("formatting failure preserves the exit code, bounds the tail, keeps the full log, and stops", async () => {
  const tempRoot = await mkdtemp(
    path.join(os.tmpdir(), "unimate-verify-test-"),
  );
  const output = captureOutput();
  const sentinel = path.join(tempRoot, "later-step-ran");

  try {
    const result = await runVerification(
      [
        {
          name: "format",
          command: process.execPath,
          args: [
            "-e",
            "for (let i = 0; i < 30000; i += 1) process.stdout.write(`EARLY-LINE-${String(i).padStart(5, '0')}\\n`); process.stdout.write('LONG-LINE-' + 'X'.repeat(30000) + '\\nLATE-LINE-29999\\n'); process.stderr.write('fixture failure detail\\n'); process.exitCode = 7",
          ],
        },
        {
          name: "must not run",
          command: process.execPath,
          args: [
            "-e",
            `require('node:fs').writeFileSync(${JSON.stringify(sentinel)}, 'ran')`,
          ],
        },
      ],
      {
        cwd: tempRoot,
        logDirectoryParent: tempRoot,
        stdout: output.stream,
        stderr: output.stream,
      },
    );
    const report = output.read();
    const fullLog = await readFile(result.logPath, "utf8");
    const tail = report
      .split("--- Failure output")[1]
      ?.split("\nVERIFY FAILED")[0];

    assert.equal(result.exitCode, 7);
    assert.equal(result.failedStep, "format");
    assert.match(report, /Step: format/);
    assert.match(
      report,
      new RegExp(
        `Command: ${process.execPath.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")} -e`,
      ),
    );
    assert.match(report, /Exit code: 7/);
    assert.match(
      report,
      new RegExp(
        `Full log: ${result.logPath.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`,
      ),
    );
    assert.ok(tail);
    assert.ok(tail.split(/\r?\n/).filter(Boolean).length <= 150);
    assert.ok(tail.length <= 20_000);
    assert.equal(tail.includes("EARLY-LINE-00000"), false);
    assert.ok(tail.includes("LATE-LINE-29999"));
    assert.ok(fullLog.includes("EARLY-LINE-00000"));
    assert.ok(fullLog.includes("LONG-LINE-"));
    assert.ok(fullLog.includes("LATE-LINE-29999"));
    assert.ok(fullLog.length > 20_000);
    assert.ok(fullLog.includes("fixture failure detail"));
    assert.equal(
      report.trimEnd().endsWith(`Full log: ${result.logPath}`),
      true,
    );
    await assert.rejects(readFile(sentinel), { code: "ENOENT" });
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
});

test("child spawn failure returns 127 and preserves a diagnostic log", async () => {
  const tempRoot = await mkdtemp(
    path.join(os.tmpdir(), "unimate-verify-test-"),
  );
  const missingCommand = path.join(tempRoot, "missing-command");

  try {
    const result = await runVerification(
      [{ name: "missing command", command: missingCommand, args: [] }],
      {
        cwd: tempRoot,
        logDirectoryParent: tempRoot,
        stdout: captureOutput().stream,
        stderr: captureOutput().stream,
      },
    );

    assert.equal(result.exitCode, 127);
    assert.equal(result.failedStep, "missing command");
    assert.match(await readFile(result.logPath, "utf8"), /Could not start/);
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
});

test("verbose mode streams successful child output", async () => {
  const tempRoot = await mkdtemp(
    path.join(os.tmpdir(), "unimate-verify-test-"),
  );
  const output = captureOutput();
  const error = captureOutput();

  try {
    const result = await runVerification(
      [
        {
          name: "verbose fixture",
          command: process.execPath,
          args: [
            "-e",
            "process.stdout.write('live output'); process.stderr.write('live error')",
          ],
        },
      ],
      {
        cwd: tempRoot,
        logDirectoryParent: tempRoot,
        verbose: true,
        stdout: output.stream,
        stderr: error.stream,
      },
    );

    assert.equal(result.exitCode, 0);
    assert.ok(output.read().includes("live output"));
    assert.ok(error.read().includes("live error"));
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
});

test("JSON report records successful steps without child output or retained logs", async () => {
  const tempRoot = await mkdtemp(
    path.join(os.tmpdir(), "unimate-verify-test-"),
  );
  const reportPath = path.join(tempRoot, "success.json");

  try {
    const result = await runVerification(
      [
        {
          name: "first success",
          command: process.execPath,
          args: [
            "-e",
            "process.stdout.write('REPORT_PRIVATE_STDOUT'); process.stderr.write('REPORT_PRIVATE_STDERR')",
          ],
        },
        {
          name: "second success",
          command: process.execPath,
          args: ["-e", "process.exitCode = 0"],
        },
      ],
      {
        cwd: tempRoot,
        logDirectoryParent: tempRoot,
        reportMode: "changed",
        reportPath,
        stdout: captureOutput().stream,
        stderr: captureOutput().stream,
      },
    );
    const reportText = await readFile(reportPath, "utf8");
    const report = JSON.parse(reportText);

    assert.equal(result.exitCode, 0);
    assert.equal(report.schemaVersion, 1);
    assert.equal(report.mode, "changed");
    assert.equal(report.status, "passed");
    assert.ok(Number.isInteger(report.durationMs));
    assert.ok(report.durationMs >= 0);
    assert.deepEqual(
      report.steps.map(({ name, status, exitCode }) => ({
        name,
        status,
        exitCode,
      })),
      [
        { name: "first success", status: "passed", exitCode: 0 },
        { name: "second success", status: "passed", exitCode: 0 },
      ],
    );
    assert.ok(report.steps.every(({ durationMs }) => durationMs >= 0));
    assert.equal(Object.hasOwn(report, "failedStep"), false);
    assert.equal(Object.hasOwn(report, "failureLogPath"), false);
    assert.equal(reportText.includes("REPORT_PRIVATE"), false);
    assert.deepEqual(await readdir(tempRoot), ["success.json"]);
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
});

test("JSON failure report preserves the child exit code and omits unrun steps and logs", async () => {
  const tempRoot = await mkdtemp(
    path.join(os.tmpdir(), "unimate-verify-test-"),
  );
  const reportPath = path.join(tempRoot, "failure.json");
  const output = captureOutput();
  const laterStep = path.join(tempRoot, "later-step-ran");

  try {
    const result = await runVerification(
      [
        {
          name: "passed fixture",
          command: process.execPath,
          args: ["-e", "process.exitCode = 0"],
        },
        {
          name: "failed fixture",
          command: process.execPath,
          args: [
            "-e",
            "process.stdout.write('REPORT_PRIVATE_STDOUT'); process.stderr.write('REPORT_PRIVATE_STDERR'); process.exitCode = 9",
          ],
        },
        {
          name: "unrun fixture",
          command: process.execPath,
          args: [
            "-e",
            `require('node:fs').writeFileSync(${JSON.stringify(laterStep)}, 'ran')`,
          ],
        },
      ],
      {
        cwd: tempRoot,
        logDirectoryParent: tempRoot,
        reportMode: "full",
        reportPath,
        stdout: output.stream,
        stderr: output.stream,
      },
    );
    const reportText = await readFile(reportPath, "utf8");
    const report = JSON.parse(reportText);
    const fullLog = await readFile(report.failureLogPath, "utf8");

    assert.equal(result.exitCode, 9);
    assert.equal(result.failedStep, "failed fixture");
    assert.equal(report.schemaVersion, 1);
    assert.equal(report.mode, "full");
    assert.equal(report.status, "failed");
    assert.equal(report.failedStep, "failed fixture");
    assert.equal(report.failureLogPath, result.logPath);
    assert.deepEqual(
      report.steps.map(({ status, exitCode }) => ({ status, exitCode })),
      [
        { status: "passed", exitCode: 0 },
        { status: "failed", exitCode: 9 },
        { status: "not_run", exitCode: null },
      ],
    );
    assert.ok(report.steps.every(({ durationMs }) => durationMs >= 0));
    assert.equal(reportText.includes("REPORT_PRIVATE"), false);
    assert.ok(fullLog.includes("REPORT_PRIVATE_STDOUT"));
    assert.ok(fullLog.includes("REPORT_PRIVATE_STDERR"));
    assert.match(output.read(), /Exit code: 9/);
    await assert.rejects(readFile(laterStep), { code: "ENOENT" });
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
});

test("JSON report write failure is visible and does not report verification success", async () => {
  const tempRoot = await mkdtemp(
    path.join(os.tmpdir(), "unimate-verify-test-"),
  );
  const output = captureOutput();
  const error = captureOutput();
  const reportPath = path.join(tempRoot, "missing-directory", "result.json");

  try {
    const result = await runVerification(
      [
        {
          name: "success before report failure",
          command: process.execPath,
          args: ["-e", "process.exitCode = 0"],
        },
      ],
      {
        cwd: tempRoot,
        logDirectoryParent: tempRoot,
        reportMode: "full",
        reportPath,
        stdout: output.stream,
        stderr: error.stream,
      },
    );

    assert.equal(result.exitCode, 1);
    assert.match(error.read(), /Could not write JSON verification report/);
    assert.match(output.read(), /VERIFY FAILED/);
    assert.equal(output.read().includes("VERIFY PASSED"), false);
    assert.deepEqual(await readdir(tempRoot), []);
    await assert.rejects(readFile(reportPath), { code: "ENOENT" });
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
});

test("verification arguments compose changed, verbose, and JSON report modes", () => {
  assert.deepEqual(
    parseVerificationArguments([
      "--changed",
      "--verbose",
      "--report-json",
      "reports/changed.json",
    ]),
    {
      changed: true,
      verbose: true,
      reportPath: "reports/changed.json",
    },
  );
  assert.throws(
    () => parseVerificationArguments(["--report-json"]),
    /requires one output path/,
  );
  assert.throws(
    () =>
      parseVerificationArguments([
        "--report-json",
        "one.json",
        "--report-json",
        "two.json",
      ]),
    /may be specified only once/,
  );
  assert.throws(
    () => parseVerificationArguments(["--unknown"]),
    /Unknown verification argument/,
  );
});

test("verification steps run sequentially", async () => {
  const tempRoot = await mkdtemp(
    path.join(os.tmpdir(), "unimate-verify-test-"),
  );
  const marker = path.join(tempRoot, "first-step-finished");

  try {
    const result = await runVerification(
      [
        {
          name: "write completion marker",
          command: process.execPath,
          args: [
            "-e",
            `setTimeout(() => require('node:fs').writeFileSync(${JSON.stringify(marker)}, 'finished'), 20)`,
          ],
        },
        {
          name: "read completion marker",
          command: process.execPath,
          args: [
            "-e",
            `process.exitCode = require('node:fs').readFileSync(${JSON.stringify(marker)}, 'utf8') === 'finished' ? 0 : 11`,
          ],
        },
      ],
      {
        cwd: tempRoot,
        logDirectoryParent: tempRoot,
        stdout: captureOutput().stream,
        stderr: captureOutput().stream,
      },
    );

    assert.equal(result.exitCode, 0);
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
});

async function assertInterruptedRunnerStopsChild(signal) {
  const tempRoot = await mkdtemp(
    path.join(os.tmpdir(), "unimate-verify-test-"),
  );
  const marker = path.join(tempRoot, "active-child-pid");
  const resultPath = path.join(tempRoot, "runner-result.json");
  const reportPath = path.join(tempRoot, "signal-report.json");
  const modulePath = new URL("./verify.mjs", import.meta.url).href;
  const childSource = `process.stdout.write('signal child started\\n', () => { require('node:fs').writeFileSync(${JSON.stringify(marker)}, String(process.pid)); setInterval(() => {}, 1000) })`;
  let childPid;
  const runnerSource = `
    import { runVerification } from ${JSON.stringify(modulePath)};
    import { writeFile } from "node:fs/promises";
    const result = await runVerification(
      [{
        name: "long-running fixture",
        command: "pnpm",
        args: ["exec", process.execPath, "-e", ${JSON.stringify(childSource)}],
      }],
      {
        cwd: ${JSON.stringify(process.cwd())},
        logDirectoryParent: ${JSON.stringify(tempRoot)},
        reportMode: "full",
        reportPath: ${JSON.stringify(reportPath)},
      },
    );
    await writeFile(${JSON.stringify(resultPath)}, JSON.stringify(result));
    process.exitCode = result.exitCode;
  `;
  const runner = spawn(
    process.execPath,
    ["--input-type=module", "-e", runnerSource],
    { cwd: tempRoot, stdio: ["ignore", "pipe", "pipe"] },
  );
  let runnerClosed = false;
  const runnerClose = new Promise((resolve) => {
    runner.once("close", (code, signal) => {
      runnerClosed = true;
      resolve({ code, signal });
    });
  });

  try {
    for (let attempt = 0; attempt < 200; attempt += 1) {
      try {
        childPid = Number(await readFile(marker, "utf8"));
        break;
      } catch (error) {
        if (error.code !== "ENOENT") {
          throw error;
        }
        await new Promise((resolve) => setTimeout(resolve, 10));
      }
    }

    assert.ok(childPid, "The long-running verification child did not start.");
    runner.kill(signal);
    let timeoutHandle;
    const { code, signal: closeSignal } = await Promise.race([
      runnerClose,
      new Promise((_, reject) => {
        timeoutHandle = setTimeout(
          () => reject(new Error(`Runner did not stop after ${signal}`)),
          5_000,
        );
      }),
    ]);
    clearTimeout(timeoutHandle);
    const result = JSON.parse(await readFile(resultPath, "utf8"));
    const report = JSON.parse(await readFile(reportPath, "utf8"));
    const fullLog = await readFile(result.logPath, "utf8");
    let childStillRunning = true;

    try {
      process.kill(childPid, 0);
    } catch (error) {
      if (error.code === "ESRCH") {
        childStillRunning = false;
      } else {
        throw error;
      }
    }

    const expectedExitCode = 128 + os.constants.signals[signal];
    assert.equal(code, expectedExitCode);
    assert.equal(closeSignal, null);
    assert.equal(result.exitCode, expectedExitCode);
    assert.equal(report.status, "failed");
    assert.equal(report.failedStep, "long-running fixture");
    assert.equal(report.failureLogPath, result.logPath);
    assert.ok(fullLog.includes("signal child started"));
    assert.equal(childStillRunning, false);
  } finally {
    if (!runnerClosed) {
      runner.kill("SIGTERM");
      let cleanupTimeout;
      await Promise.race([
        runnerClose,
        new Promise((resolve) => {
          cleanupTimeout = setTimeout(resolve, 2_000);
        }),
      ]);
      clearTimeout(cleanupTimeout);
      if (!runnerClosed) {
        runner.kill("SIGKILL");
        if (childPid) {
          try {
            process.kill(childPid, "SIGTERM");
          } catch (error) {
            assert.equal(error.code, "ESRCH");
          }
        }
        await runnerClose;
      }
    }
    await rm(tempRoot, { recursive: true, force: true });
  }
}

test("SIGINT stops the active child and preserves its failure log", () =>
  assertInterruptedRunnerStopsChild("SIGINT"));

test("SIGTERM stops the active child and preserves its failure log", () =>
  assertInterruptedRunnerStopsChild("SIGTERM"));
