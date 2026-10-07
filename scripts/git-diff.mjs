import { Buffer } from "node:buffer";
import { spawn } from "node:child_process";
import { lstat, mkdir, readFile, readlink, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { TextDecoder } from "node:util";
import { fileURLToPath } from "node:url";

const generatedReportPath = "docs/generated/git-diff.md";
const utf8Decoder = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true });

function runGit(args, options = {}) {
  const { cwd = process.cwd(), allowedExitCodes = [0] } = options;

  return new Promise((resolve, reject) => {
    const child = spawn("git", args, {
      cwd,
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    });
    const stdout = [];
    const stderr = [];

    child.stdout.on("data", (chunk) => stdout.push(chunk));
    child.stderr.on("data", (chunk) => stderr.push(chunk));
    child.on("error", reject);
    child.on("close", (code, signal) => {
      const result = {
        code,
        stderr: Buffer.concat(stderr),
        stdout: Buffer.concat(stdout),
      };

      if (allowedExitCodes.includes(code)) {
        resolve(result);
        return;
      }

      const detail = result.stderr.toString("utf8").trim();
      reject(
        new Error(
          `git ${args.join(" ")} failed${signal ? ` (${signal})` : ` with exit code ${code}`}${detail ? `: ${detail}` : ""}`,
        ),
      );
    });
  });
}

function removeTrailingNewline(value) {
  return value.endsWith("\n") ? value.slice(0, -1) : value;
}

function splitNullDelimited(buffer) {
  const paths = [];
  let start = 0;

  for (let index = 0; index < buffer.length; index += 1) {
    if (buffer[index] === 0) {
      paths.push(buffer.subarray(start, index));
      start = index + 1;
    }
  }

  if (start < buffer.length) {
    paths.push(buffer.subarray(start));
  }

  return paths;
}

function displayPath(pathBytes) {
  const decoded = pathBytes.toString("utf8");

  if (Buffer.from(decoded, "utf8").equals(pathBytes)) {
    return decoded;
  }

  return `${decoded} [raw path bytes base64: ${pathBytes.toString("base64")}]`;
}

function markdownCodeSpan(value) {
  const text = JSON.stringify(value).slice(1, -1);
  const backtickRuns = text.match(/`+/g) ?? [];
  const delimiter = "`".repeat(
    Math.max(0, ...backtickRuns.map((run) => run.length)) + 1,
  );

  return `${delimiter}${text}${delimiter}`;
}

function fencedBlock(text, language = "") {
  const backtickRuns = text.match(/`+/g) ?? [];
  const delimiter = "`".repeat(
    Math.max(3, Math.max(0, ...backtickRuns.map((run) => run.length)) + 1),
  );
  const content = text.endsWith("\n") ? text : `${text}\n`;

  return `${delimiter}${language}\n${content}${delimiter}\n`;
}

export function isTextFileContent(bytes) {
  if (bytes.includes(0)) {
    return false;
  }

  let text;
  try {
    text = utf8Decoder.decode(bytes);
  } catch {
    return false;
  }

  for (const character of text) {
    const codePoint = character.codePointAt(0);
    if (
      (codePoint < 0x20 && ![0x09, 0x0a, 0x0c, 0x0d].includes(codePoint)) ||
      (codePoint >= 0x7f && codePoint <= 0x9f)
    ) {
      return false;
    }
  }

  return true;
}

export function renderUntrackedFile(relativePath, bytes) {
  const pathLabel = markdownCodeSpan(relativePath);

  if (!isTextFileContent(bytes)) {
    return `### Untracked file: ${pathLabel}\n\n**Binary/unrendered** (${bytes.length} bytes).\n\n`;
  }

  const text = utf8Decoder.decode(bytes);
  const noFinalNewline = !text.endsWith("\n");
  const newlineNote = noFinalNewline ? "\n> No newline at end of file.\n" : "";

  return [
    `### Untracked file: ${pathLabel}`,
    "",
    `**Full-file addition** · UTF-8 text · ${bytes.length} bytes.`,
    "",
    fencedBlock(text),
    newlineNote,
    "",
  ].join("\n");
}

function renderUnrenderedPath(relativePath, reason) {
  return `### Untracked path: ${markdownCodeSpan(relativePath)}\n\n**Binary/unrendered** (${reason}).\n\n`;
}

function getAbsolutePathBytes(root, relativePath) {
  const rootBytes = Buffer.from(root);
  const separator = root.endsWith(path.sep)
    ? Buffer.alloc(0)
    : Buffer.from(path.sep);

  return Buffer.concat([rootBytes, separator, relativePath]);
}

async function renderUntrackedPath(root, relativePathBytes) {
  const relativePath = displayPath(relativePathBytes);
  const absolutePath = getAbsolutePathBytes(root, relativePathBytes);

  let fileInfo;
  try {
    fileInfo = await lstat(absolutePath);
  } catch (error) {
    return renderUnrenderedPath(relativePath, `unreadable: ${error.message}`);
  }

  if (fileInfo.isSymbolicLink()) {
    try {
      const target = await readlink(absolutePath, { encoding: "buffer" });
      return `### Untracked symlink: ${markdownCodeSpan(relativePath)}\n\nTarget: ${markdownCodeSpan(displayPath(target))}. Contents were not followed or rendered.\n\n`;
    } catch (error) {
      return renderUnrenderedPath(
        relativePath,
        `unreadable symlink: ${error.message}`,
      );
    }
  }

  if (!fileInfo.isFile()) {
    return renderUnrenderedPath(relativePath, "non-regular filesystem entry");
  }

  try {
    const bytes = await readFile(absolutePath);
    return renderUntrackedFile(relativePath, bytes);
  } catch (error) {
    return renderUnrenderedPath(relativePath, `unreadable: ${error.message}`);
  }
}

function renderDiffSection(title, diff) {
  const content = removeTrailingNewline(diff);
  const body = content ? fencedBlock(content, "diff") : "No changes.";

  return `## ${title}\n\n${body}\n`;
}

async function createReport(root) {
  const [
    branchResult,
    headResult,
    statusResult,
    unstagedResult,
    stagedResult,
    untrackedResult,
  ] = await Promise.all([
    runGit(["symbolic-ref", "--quiet", "--short", "HEAD"], {
      cwd: root,
      allowedExitCodes: [0, 1],
    }),
    runGit(["rev-parse", "--verify", "--quiet", "HEAD"], {
      cwd: root,
      allowedExitCodes: [0, 1],
    }),
    runGit(["status", "--short", "--branch", "--untracked-files=normal"], {
      cwd: root,
    }),
    runGit(["diff", "--no-ext-diff", "--no-textconv", "--no-color"], {
      cwd: root,
      allowedExitCodes: [0, 1],
    }),
    runGit(
      ["diff", "--cached", "--no-ext-diff", "--no-textconv", "--no-color"],
      {
        cwd: root,
        allowedExitCodes: [0, 1],
      },
    ),
    runGit(["ls-files", "--others", "--exclude-standard", "-z"], {
      cwd: root,
    }),
  ]);

  const branch =
    removeTrailingNewline(branchResult.stdout.toString("utf8")) ||
    (headResult.stdout.length > 0 ? "detached HEAD" : "unborn branch");
  const head = removeTrailingNewline(headResult.stdout.toString("utf8"));
  const status = removeTrailingNewline(statusResult.stdout.toString("utf8"));
  const unstagedDiff = unstagedResult.stdout.toString("utf8");
  const stagedDiff = stagedResult.stdout.toString("utf8");
  const untrackedPaths = splitNullDelimited(untrackedResult.stdout).filter(
    (relativePath) => !relativePath.equals(Buffer.from(generatedReportPath)),
  );

  const untrackedSections = [];
  for (const relativePath of untrackedPaths) {
    untrackedSections.push(await renderUntrackedPath(root, relativePath));
  }

  return [
    "# Git Diff Review",
    "",
    "Generated from the current working tree. This report does not modify the Git index.",
    "",
    "> **Security warning:** This report may contain credentials, tokens, personal data, or other sensitive information from uncommitted files. Review it carefully before sharing externally.",
    "",
    "## Repository summary",
    "",
    `- Branch: ${markdownCodeSpan(branch)}`,
    `- HEAD: ${head ? `\`${head}\`` : "No commit yet."}`,
    "",
    "Concise status:",
    "",
    fencedBlock(status, "text"),
    "",
    renderDiffSection("Tracked unstaged changes", unstagedDiff),
    renderDiffSection("Staged changes", stagedDiff),
    "## Untracked, non-ignored files",
    "",
    untrackedSections.length > 0
      ? untrackedSections.join("")
      : "No untracked, non-ignored files.",
    "",
  ].join("\n");
}

async function main() {
  const rootResult = await runGit(["rev-parse", "--show-toplevel"]);
  const root = removeTrailingNewline(rootResult.stdout.toString("utf8"));
  const report = await createReport(root);
  const outputPath = path.join(root, generatedReportPath);

  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, report, "utf8");
  process.stdout.write(`Wrote ${path.relative(process.cwd(), outputPath)}\n`);
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : "";
if (invokedPath === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    process.stderr.write(
      `Unable to generate Git diff report: ${error.message}\n`,
    );
    process.exitCode = 1;
  });
}
