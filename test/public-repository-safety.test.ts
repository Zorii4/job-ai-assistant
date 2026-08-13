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
const caddyfile = readFileSync("Caddyfile", "utf8");
const composeFile = readFileSync("compose.yaml", "utf8");

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

test("Caddy routes API requests before the SPA fallback", () => {
  const apiHandleIndex = caddyfile.indexOf("handle @api {");
  const spaHandleIndex = caddyfile.indexOf("\n\thandle {");

  assert.ok(apiHandleIndex >= 0, "API routes must use an explicit handle block");
  assert.ok(spaHandleIndex > apiHandleIndex, "SPA fallback must follow the API handle block");
});

test("worker receives configured LLM output limits", () => {
  for (const variable of [
    "LLM_MAX_OUTPUT_TOKENS_ANALYST",
    "LLM_MAX_OUTPUT_TOKENS_PRODUCER",
    "LLM_MAX_OUTPUT_TOKENS_CRITIC",
    "LLM_CRITIC_MODEL",
    "LLM_CRITIC_TIMEOUT_MS",
    "LLM_CRITIC_FALLBACK_MODEL",
    "LLM_CRITIC_FALLBACK_CONTEXT_CHARS",
    "LLM_MAX_OUTPUT_TOKENS_CRITIC_FALLBACK",
    "LLM_TRANSIENT_RETRY_MAX_ATTEMPTS",
    "LLM_MAX_OUTPUT_TOKENS_ORCHESTRATOR_FINAL"
  ]) {
    const expected = `${variable}: $` + `{${variable}:-}`;
    assert.ok(composeFile.includes(expected), `${variable} must be passed to worker`);
  }
});
