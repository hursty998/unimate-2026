import assert from "node:assert/strict";
import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import test from "node:test";
import { runVerification } from "./verify.mjs";

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

  try {
    const result = await runVerification(
      [
        {
          name: "tiny success",
          command: process.execPath,
          args: ["-e", "process.stdout.write('hidden success log')"],
        },
      ],
      {
        cwd: tempRoot,
        logDirectoryParent: tempRoot,
        stdout: output.stream,
        stderr: output.stream,
      },
    );

    assert.equal(result.exitCode, 0);
    assert.match(output.read(), /✓ tiny success/);
    assert.match(output.read(), /VERIFY PASSED/);
    assert.equal(output.read().includes("hidden success log"), false);
    assert.deepEqual(await readdir(tempRoot), []);
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
});

test("failure preserves the exit code, bounds the tail, keeps the full log, and stops", async () => {
  const tempRoot = await mkdtemp(
    path.join(os.tmpdir(), "unimate-verify-test-"),
  );
  const output = captureOutput();
  const sentinel = path.join(tempRoot, "later-step-ran");

  try {
    const result = await runVerification(
      [
        {
          name: "failing fixture",
          command: process.execPath,
          args: [
            "-e",
            "for (let i = 0; i < 250; i += 1) process.stdout.write(`LINE-${String(i).padStart(3, '0')}\\n`); process.stderr.write('fixture failure detail\\n'); process.exitCode = 7",
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
    assert.equal(result.failedStep, "failing fixture");
    assert.match(report, /Step: failing fixture/);
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
    assert.equal(tail.includes("LINE-000"), false);
    assert.ok(tail.includes("LINE-249"));
    assert.ok(fullLog.includes("LINE-000"));
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

test("verbose mode streams successful child output", async () => {
  const tempRoot = await mkdtemp(
    path.join(os.tmpdir(), "unimate-verify-test-"),
  );
  const output = captureOutput();

  try {
    const result = await runVerification(
      [
        {
          name: "verbose fixture",
          command: process.execPath,
          args: ["-e", "process.stdout.write('live output')"],
        },
      ],
      {
        cwd: tempRoot,
        logDirectoryParent: tempRoot,
        verbose: true,
        stdout: output.stream,
        stderr: output.stream,
      },
    );

    assert.equal(result.exitCode, 0);
    assert.ok(output.read().includes("live output"));
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
});
