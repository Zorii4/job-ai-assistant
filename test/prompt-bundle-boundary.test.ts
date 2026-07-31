import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  PromptBundleConfigurationError,
  loadInitialWorkflowPromptBundle,
} from "../src/ai/initialWorkflowPromptBundle.js";

test("mock mode uses a public deterministic prompt bundle", async () => {
  const bundle = await loadInitialWorkflowPromptBundle(true);

  assert.match(bundle.analyst, /analystAgent/);
  assert.match(bundle.producer, /producerAgent/);
  assert.match(bundle.critic, /criticAgent/);
  assert.match(bundle.orchestrator, /orchestratorAgent/);
});

test("production mode fails before an LLM request when the private bundle is absent", async () => {
  await assert.rejects(
    () => loadInitialWorkflowPromptBundle(false, async () => {
      throw new Error("module not found");
    }),
    PromptBundleConfigurationError
  );
});

test("production mode rejects a malformed private prompt bundle", async () => {
  await assert.rejects(
    () => loadInitialWorkflowPromptBundle(false, async () => ({})),
    PromptBundleConfigurationError
  );
});

test("tracked agents do not directly import private production prompts", async () => {
  const agentSources = await Promise.all(
    ["analyst", "producer", "critic", "orchestrator"].map((agentName) =>
      readFile(new URL(`../src/agents/${agentName}.agent.ts`, import.meta.url), "utf8")
    )
  );

  for (const agentSource of agentSources) {
    assert.doesNotMatch(agentSource, /from ["']\.\.\/prompts\//);
  }
});
