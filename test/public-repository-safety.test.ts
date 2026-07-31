import assert from "node:assert/strict";
import test from "node:test";
import {
  checkFiles,
  classifyPath,
  findContentViolation,
  loadPolicy,
} from "../scripts/check-public-repository.mjs";

const rules = loadPolicy();

test("public file policy classifies tracked paths and blocks private paths", () => {
  assert.equal(classifyPath("AGENTS.md", rules), "PUBLIC");
  assert.equal(classifyPath("local/internal-docs/SPEC.md", rules), "PRIVATE");
  assert.equal(classifyPath("apps/api/src/main.ts", rules), "PUBLIC");
  assert.equal(classifyPath("src/prompts/analyst.prompt.ts", rules), "PRIVATE");
  assert.equal(classifyPath("evaluation/results/run.json", rules), "PRIVATE");
  assert.equal(classifyPath("notes/unknown.md", rules), "UNCLASSIFIED");
});

test("public safety check rejects private and unclassified files", () => {
  const violations = checkFiles({
    mode: "all",
    paths: ["src/prompts/analyst.prompt.ts", "notes/unknown.md", "apps/api/src/main.ts"],
    rules,
    readContent: () => "export const health = true;",
  });

  assert.deepEqual(violations, [
    "src/prompts/analyst.prompt.ts: запрещённая для Git классификация PRIVATE",
    "notes/unknown.md: отсутствует классификация public-file-policy.json",
  ]);
});

test("public safety check detects a secret-shaped value in a public file", () => {
  const violation = findContentViolation(`const key = \"sk-${"a".repeat(20)}\";`);
  assert.equal(violation, "OpenAI-like API key");
});
