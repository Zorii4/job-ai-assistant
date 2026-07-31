import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  checkFiles,
  classifyPath,
  findContentViolation,
  loadPolicy,
} from "../scripts/check-public-repository.mjs";

const rules = loadPolicy();

const dockerIgnoreEntries = new Set(
  readFileSync(".dockerignore", "utf8")
    .split(/\r?\n/)
    .map((entry) => entry.trim())
    .filter((entry) => entry && !entry.startsWith("#"))
);

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

test("Docker build context excludes the local private overlay", () => {
  const requiredPrivateEntries = [
    ".agents",
    ".codex",
    ".hallmark",
    ".env",
    ".env.*",
    "SPEC.md",
    "PROJECT_PLAN.md",
    "PUBLIC_RELEASE_PLAN.md",
    "design.md",
    "DESIGN.md",
    "data",
    "evaluation",
    "private",
    "secrets",
    "local",
    "src/prompts",
    "uploads",
  ];

  for (const entry of requiredPrivateEntries) {
    assert.ok(dockerIgnoreEntries.has(entry), `${entry} must be excluded from Docker context`);
  }
});
