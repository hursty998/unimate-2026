// Pure source analysis used only by the access-posture architecture test.
import * as ts from "typescript";
import type { ApiAccessPosture } from "../modules/auth/access-posture.decorator.js";

const controllerDecorator = "Controller";
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
const postureDecorators = new Map<string, ApiAccessPosture>([
  ["Public", "PUBLIC"],
  ["Authenticated", "AUTHENTICATED"],
  ["RequireCapability", "AUTHORISED"],
]);

export interface AccessPostureSourceIssue {
  declaration: "controller" | "operation";
  line: number;
  message: string;
}

export interface AccessPostureSourceAnalysis {
  operationCount: number;
  issues: AccessPostureSourceIssue[];
}

function decoratorsOn(node: ts.Node): readonly ts.Decorator[] {
  return ts.canHaveDecorators(node) ? (ts.getDecorators(node) ?? []) : [];
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

function sourcePostures(node: ts.Node): ApiAccessPosture[] {
  return decoratorsOn(node)
    .map((decorator) => postureDecorators.get(decoratorName(decorator) ?? ""))
    .filter((posture): posture is ApiAccessPosture => posture !== undefined);
}

function lineOf(sourceFile: ts.SourceFile, node: ts.Node): number {
  return (
    sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1
  );
}

export function analyzeAccessPostureSource(
  source: string,
  fileName: string,
): AccessPostureSourceAnalysis {
  const sourceFile = ts.createSourceFile(
    fileName,
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  );
  const issues: AccessPostureSourceIssue[] = [];
  let operationCount = 0;

  const visit = (node: ts.Node) => {
    if (
      ts.isClassDeclaration(node) &&
      decoratorsOn(node).some(
        (decorator) => decoratorName(decorator) === controllerDecorator,
      )
    ) {
      const controllerPostures = sourcePostures(node);

      if (controllerPostures.length > 1) {
        issues.push({
          declaration: "controller",
          line: lineOf(sourceFile, node),
          message: `Controller declares multiple access postures: ${controllerPostures.join(", ")}.`,
        });
      }

      for (const member of node.members) {
        if (!ts.isMethodDeclaration(member)) {
          continue;
        }

        const memberDecorators = decoratorsOn(member);
        if (
          !memberDecorators.some((decorator) => {
            const name = decoratorName(decorator);
            return name !== undefined && operationDecorators.has(name);
          })
        ) {
          continue;
        }

        operationCount += 1;
        const methodPostures = sourcePostures(member);
        const methodName = member.name?.getText(sourceFile) ?? "operation";

        if (methodPostures.length > 1) {
          issues.push({
            declaration: "operation",
            line: lineOf(sourceFile, member),
            message: `${methodName} declares multiple access postures: ${methodPostures.join(", ")}.`,
          });
        }

        if (methodPostures.length === 0 && controllerPostures.length !== 1) {
          issues.push({
            declaration: "operation",
            line: lineOf(sourceFile, member),
            message: `${methodName} has no single effective access posture.`,
          });
        }
      }
    }

    ts.forEachChild(node, visit);
  };

  visit(sourceFile);

  return { operationCount, issues };
}
