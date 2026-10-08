import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { relative, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import * as ts from "typescript";

const sourceDirectory = fileURLToPath(new URL("../src/", import.meta.url));
const operationDecorators = new Set([
  "Implement",
  "Get",
  "Post",
  "Put",
  "Patch",
  "Delete",
  "Options",
  "Head",
  "All",
]);
const postureDecorators = new Set([
  "Public",
  "Authenticated",
  "RequireCapability",
]);

function sourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);

    if (entry.isDirectory()) {
      return sourceFiles(path);
    }

    return entry.isFile() &&
      entry.name.endsWith(".ts") &&
      !entry.name.endsWith(".test.ts")
      ? [path]
      : [];
  });
}

function decoratorName(decorator: ts.Decorator): string | undefined {
  const expression = decorator.expression;
  const target = ts.isCallExpression(expression)
    ? expression.expression
    : expression;

  if (ts.isIdentifier(target)) {
    return target.text;
  }

  if (ts.isPropertyAccessExpression(target)) {
    return target.name.text;
  }

  return undefined;
}

function decoratorsOn(node: ts.Node): readonly ts.Decorator[] {
  return ts.canHaveDecorators(node) ? (ts.getDecorators(node) ?? []) : [];
}

function hasAnyDecorator(
  decorators: readonly ts.Decorator[],
  names: Set<string>,
): boolean {
  return decorators.some((decorator) => {
    const name = decoratorName(decorator);
    return name !== undefined && names.has(name);
  });
}

test("every production API operation declares an access posture", () => {
  let operationCount = 0;

  for (const path of sourceFiles(sourceDirectory)) {
    const source = readFileSync(path, "utf8");
    const sourceFile = ts.createSourceFile(
      path,
      source,
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.TS,
    );

    const visit = (node: ts.Node) => {
      if (
        ts.isClassDeclaration(node) &&
        hasAnyDecorator(decoratorsOn(node), new Set(["Controller"]))
      ) {
        const classDeclaresPosture = hasAnyDecorator(
          decoratorsOn(node),
          postureDecorators,
        );

        for (const member of node.members) {
          if (!ts.isMethodDeclaration(member)) {
            continue;
          }

          const memberDecorators = decoratorsOn(member);
          if (!hasAnyDecorator(memberDecorators, operationDecorators)) {
            continue;
          }

          operationCount += 1;
          const declaresPosture =
            classDeclaresPosture ||
            hasAnyDecorator(memberDecorators, postureDecorators);
          const position = sourceFile.getLineAndCharacterOfPosition(
            member.pos,
          ).line;

          assert.ok(
            declaresPosture,
            `${relative(sourceDirectory, path)}:${position + 1} ${member.name?.getText(sourceFile) ?? "operation"} must declare @Public(), @Authenticated(), or @RequireCapability().`,
          );
        }
      }

      ts.forEachChild(node, visit);
    };

    visit(sourceFile);
  }

  assert.ok(operationCount > 0, "No production API operations were found.");
});
