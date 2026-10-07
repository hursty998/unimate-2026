import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import test from "node:test";
import { isTextFileContent, renderUntrackedFile } from "./git-diff.mjs";

test("recognizes valid UTF-8 text and rejects binary or invalid UTF-8 bytes", () => {
  assert.equal(isTextFileContent(Buffer.from("Hello, UniMate\n世界\n")), true);
  assert.equal(isTextFileContent(Buffer.from("\uFEFFUTF-8 text")), true);
  assert.equal(isTextFileContent(Buffer.from([0x61, 0x00, 0x62])), false);
  assert.equal(isTextFileContent(Buffer.from([0xc3, 0x28])), false);
  assert.equal(isTextFileContent(Buffer.from([0x61, 0x01, 0x62])), false);
});

test("renders the entire untracked text file and safely quotes its path", () => {
  const contents = "# Review\n\n```ts\nconst value = 1;\n```\n";
  const report = renderUntrackedFile(
    "src/space `name`.md",
    Buffer.from(contents),
  );

  assert.match(report, /Untracked file: .*src\/space `name`\.md/);
  assert.match(report, /\*\*Full-file addition\*\*/);
  assert.match(report, /````\n# Review\n\n```ts\nconst value = 1;\n```\n````/);
});

test("marks files without a final newline and never renders binary contents", () => {
  const textReport = renderUntrackedFile(
    "no-final-newline.txt",
    Buffer.from("last line"),
  );
  const binaryBytes = Buffer.from([0x00, 0xff, 0x10]);
  const binaryReport = renderUntrackedFile("image.bin", binaryBytes);

  assert.match(textReport, /No newline at end of file/);
  assert.match(binaryReport, /\*\*Binary\/unrendered\*\*/);
  assert.doesNotMatch(binaryReport, /ff|10/);
});
