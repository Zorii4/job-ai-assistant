import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { AnalyzeJobApplicationProgressEvent } from "../src/types/jobApplication.js";

const originalWorkingDirectory = process.cwd();
const testWorkingDirectory = await mkdtemp(join(tmpdir(), "job-ai-assistant-flow-test-"));

process.env.LLM_MOCK = "true";
process.env.SAVE_INPUT_TEXT = "false";
process.chdir(testWorkingDirectory);

const { analyzeJobApplication } = await import("../src/app/analyzeJobApplication.js");

before(() => {
  process.chdir(testWorkingDirectory);
});

after(async () => {
  process.chdir(originalWorkingDirectory);
  await rm(testWorkingDirectory, { recursive: true, force: true });
});

test("Mock fast flow blocks final output when critical findings remain", async () => {
  process.env.ANALYSIS_MODE = "fast";
  process.env.MAX_REVISION_CYCLES = "2";
  const progressEvents: AnalyzeJobApplicationProgressEvent[] = [];

  await assert.rejects(
    analyzeJobApplication({
      resumeText: "Candidate has product delivery experience.",
      vacancyText: "The role requires product delivery and collaboration.",
      source: "cli",
      onProgress: (event) => {
        progressEvents.push(event);
      }
    }),
    /Critical Critic findings remain/
  );

  assert.deepEqual(
    progressEvents,
    [
      { stage: "analyst", stepName: "analyst" },
      { stage: "producer", stepName: "producer.v1" },
      { stage: "critic", stepName: "critic.v1" }
    ]
  );
});

test("Mock revision flow stops after the third producer version", async () => {
  process.env.ANALYSIS_MODE = "deep";
  process.env.MAX_REVISION_CYCLES = "2";
  const progressEvents: AnalyzeJobApplicationProgressEvent[] = [];

  const result = await analyzeJobApplication({
    resumeText: "Candidate has product delivery experience.",
    vacancyText: "The role requires product delivery and collaboration.",
    source: "cli",
    onProgress: (event) => {
      progressEvents.push(event);
    }
  });

  assert.deepEqual(
    result.steps.map((step) => step.agentName),
    [
      "analyst",
      "producer.v1",
      "critic.v1",
      "producer.v2",
      "critic.v2",
      "producer.v3",
      "critic.v3",
      "orchestrator.final"
    ]
  );
  assert.deepEqual(progressEvents, [
    { stage: "analyst", stepName: "analyst" },
    { stage: "producer", stepName: "producer.v1" },
    { stage: "critic", stepName: "critic.v1" },
    { stage: "producer", stepName: "producer.v2" },
    { stage: "critic", stepName: "critic.v2" },
    { stage: "producer", stepName: "producer.v3" },
    { stage: "critic", stepName: "critic.v3" },
    { stage: "final", stepName: "orchestrator.final" }
  ]);
  assert.equal(result.meta.analysisMode, "deep");
  assert.equal(result.meta.revisionCyclesUsed, 2);
  assert.equal(result.meta.finalDecision, "APPROVED");
  assert.deepEqual(
    result.steps.map((step) => ({
      attemptCount: step.attemptCount,
      retryErrorCodes: step.retryErrorCodes
    })),
    Array.from({ length: 8 }, () => ({ attemptCount: 1, retryErrorCodes: [] }))
  );
  assert.match(result.finalMarkdown, /^# Mock response: orchestratorAgent/m);
});
