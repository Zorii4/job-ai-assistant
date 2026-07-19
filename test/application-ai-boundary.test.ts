import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("application use case delegates agent execution to the AI workflow runner", async () => {
  const applicationSource = await readFile(
    new URL("../src/app/analyzeJobApplication.ts", import.meta.url),
    "utf8"
  );
  const workflowSource = await readFile(
    new URL("../src/ai/runInitialAnalysisWorkflow.ts", import.meta.url),
    "utf8"
  );
  const agentSources = await Promise.all(
    ["analyst", "producer", "critic", "orchestrator"].map((agentName) =>
      readFile(new URL(`../src/agents/${agentName}.agent.ts`, import.meta.url), "utf8")
    )
  );

  assert.match(applicationSource, /runInitialAnalysisWorkflow/);
  assert.doesNotMatch(applicationSource, /from "\.\.\/agents\//);
  assert.doesNotMatch(applicationSource, /from "\.\.\/files\//);
  assert.match(workflowSource, /from "\.\.\/agents\/analyst\.agent\.js"/);
  assert.doesNotMatch(workflowSource, /telegram|grammy/i);

  for (const agentSource of agentSources) {
    assert.doesNotMatch(agentSource, /telegram|grammy/i);
  }
});
