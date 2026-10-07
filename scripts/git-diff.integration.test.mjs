import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import { execFileSync } from "node:child_process";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import test from "node:test";
import { fileURLToPath, URL } from "node:url";

const scriptPath = fileURLToPath(new URL("./git-diff.mjs", import.meta.url));

function git(cwd, ...args) {
  return execFileSync("git", args, { cwd, encoding: "utf8" });
}

test("generates a complete report without changing the index", async () => {
  const repository = await mkdtemp(path.join(os.tmpdir(), "unimate-git-diff-"));

  try {
    git(repository, "init", "--quiet");
    git(repository, "config", "user.name", "Git Diff Test");
    git(repository, "config", "user.email", "git-diff-test@example.invalid");

    await writeFile(
      path.join(repository, ".gitignore"),
      "/docs/generated/git-diff.md\nignored.txt\n",
    );
    await writeFile(path.join(repository, "tracked.txt"), "base line\n");
    git(repository, "add", ".gitignore", "tracked.txt");
    git(repository, "commit", "--quiet", "-m", "Initial test files");

    await writeFile(
      path.join(repository, "tracked.txt"),
      "base line\nstaged line\n",
    );
    git(repository, "add", "tracked.txt");
    await writeFile(
      path.join(repository, "tracked.txt"),
      "base line\nstaged line\nunstaged line\n",
    );

    await writeFile(
      path.join(repository, "new file with spaces.txt"),
      "full text addition\n",
    );
    await writeFile(
      path.join(repository, "binary.bin"),
      Buffer.from("private binary marker\0"),
    );
    await writeFile(path.join(repository, "ignored.txt"), "ignored contents\n");
    await mkdir(path.join(repository, "docs/generated"), { recursive: true });
    await writeFile(
      path.join(repository, "docs/generated/git-diff.md"),
      "stale report contents\n",
    );

    const indexBefore = git(repository, "diff", "--cached");
    execFileSync(process.execPath, [scriptPath], { cwd: repository });
    const report = await readFile(
      path.join(repository, "docs/generated/git-diff.md"),
      "utf8",
    );
    const indexAfter = git(repository, "diff", "--cached");

    assert.equal(indexAfter, indexBefore);
    assert.match(
      report,
      /> \*\*Security warning:\*\* This report may contain credentials, tokens, personal data, or other sensitive information from uncommitted files\. Review it carefully before sharing externally\./,
    );
    assert.match(report, /## Repository summary/);
    assert.match(report, /- HEAD: `[0-9a-f]{40,}`/);
    assert.match(report, /## Tracked unstaged changes[\s\S]*\+unstaged line/);
    assert.match(report, /## Staged changes[\s\S]*\+staged line/);
    assert.match(report, /Untracked file: `new file with spaces\.txt`/);
    assert.match(report, /full text addition/);
    assert.match(
      report,
      /Untracked file: `binary\.bin`[\s\S]*Binary\/unrendered/,
    );
    assert.doesNotMatch(report, /private binary marker/);
    assert.doesNotMatch(report, /ignored\.txt|ignored contents/);
    assert.doesNotMatch(
      report,
      /### Untracked (?:file|path): `docs\/generated\/git-diff\.md`/,
    );
  } finally {
    await rm(repository, { recursive: true, force: true });
  }
});
