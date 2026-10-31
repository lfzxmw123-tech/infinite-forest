import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";
const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map((m) => m[1]);
assert.equal(ids.length, new Set(ids).size, "DOM ids must be unique");
const known = new Set(ids),
  main = readFileSync(new URL("../src/main.ts", import.meta.url), "utf8");
const source = ts.createSourceFile(
  "main.ts",
  main,
  ts.ScriptTarget.Latest,
  true,
);
let references = 0;
function visit(node: ts.Node) {
  if (
    ts.isCallExpression(node) &&
    ts.isIdentifier(node.expression) &&
    node.expression.text === "$"
  ) {
    const arg = node.arguments[0];
    if (arg && ts.isStringLiteral(arg)) {
      references++;
      assert.ok(
        known.has(arg.text),
        `Event/UI binding refers to a missing element: #${arg.text}`,
      );
    }
  }
  ts.forEachChild(node, visit);
}
visit(source);
assert.ok(
  known.has("auto-enter"),
  "The home page retains automatic tour entry",
);
assert.ok(
  !known.has("tour"),
  "Removed settings/header tour entry must stay removed",
);
console.log(
  `PASS: ${references} UI references match the HTML, unique ids, correct automatic tour entry.`,
);
