import { spawnSync } from "node:child_process";
import { lstat, readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { findCredentialFindings } from "./secret-scan.mjs";

const repositoryRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);

function runGit(args) {
  const result = spawnSync("git", args, {
    cwd: repositoryRoot,
    encoding: "buffer",
    maxBuffer: 10 * 1024 * 1024,
  });

  if (result.status !== 0 || result.error) {
    throw new Error("Could not enumerate changed repository files.");
  }

  return result.stdout
    .toString("utf8")
    .split("\0")
    .filter((filePath) => filePath.length > 0);
}

function getCurrentLocalSupabaseSecretKey() {
  const result = spawnSync("supabase", ["status", "-o", "json"], {
    cwd: repositoryRoot,
    encoding: "utf8",
    timeout: 10_000,
    maxBuffer: 1024 * 1024,
  });

  if (result.status !== 0 || result.error || !result.stdout) {
    return undefined;
  }

  try {
    const status = JSON.parse(result.stdout);
    return typeof status.SECRET_KEY === "string" &&
      status.SECRET_KEY.startsWith("sb_secret_")
      ? status.SECRET_KEY
      : undefined;
  } catch {
    return undefined;
  }
}

async function scanChangedFiles() {
  const changedFiles = runGit([
    "diff",
    "HEAD",
    "--name-only",
    "--diff-filter=ACMR",
    "-z",
  ]);
  const untrackedFiles = runGit([
    "ls-files",
    "--others",
    "--exclude-standard",
    "-z",
  ]);
  const filePaths = [...new Set([...changedFiles, ...untrackedFiles])].sort();
  const localSecretKey = getCurrentLocalSupabaseSecretKey();
  const findings = [];
  let scannedCount = 0;

  for (const filePath of filePaths) {
    const absolutePath = path.join(repositoryRoot, filePath);
    const fileInfo = await lstat(absolutePath);

    if (!fileInfo.isFile()) {
      continue;
    }

    const content = await readFile(absolutePath);

    if (content.includes(0)) {
      continue;
    }

    scannedCount += 1;
    const fileFindings = findCredentialFindings(
      filePath.replaceAll(path.sep, "/"),
      content.toString("utf8"),
      localSecretKey,
    );

    for (const finding of fileFindings) {
      findings.push({ filePath, ...finding });
    }
  }

  return {
    findings,
    localSecretKeyAvailable: localSecretKey !== undefined,
    scannedCount,
  };
}

try {
  const { findings, localSecretKeyAvailable, scannedCount } =
    await scanChangedFiles();

  if (findings.length > 0) {
    process.stderr.write(
      `Secret check failed: ${findings.length} high-confidence finding(s) in changed files. Remove the credential/config and rotate any exposed secret.\n`,
    );
    for (const finding of findings) {
      process.stderr.write(
        `- ${finding.filePath}:${finding.line} (${finding.category}; value redacted)\n`,
      );
    }
    process.exitCode = 1;
  } else {
    process.stdout.write(
      `Secret check passed: ${scannedCount} changed/untracked file(s) scanned; no credential findings.`,
    );
    process.stdout.write(
      localSecretKeyAvailable
        ? " Current local Supabase key was checked.\n"
        : " Local Supabase key check skipped (local stack unavailable).\n",
    );
  }
} catch (error) {
  const message =
    error instanceof Error
      ? error.message
      : "Could not complete the changed-file credential scan.";
  process.stderr.write(`Secret check failed: ${message}\n`);
  process.exitCode = 1;
}
