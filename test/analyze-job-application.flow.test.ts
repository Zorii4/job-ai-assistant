import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  WebAnalysisWorkflowError,
  type AnalyzeJobApplicationProgressEvent
} from "../src/types/jobApplication.js";
import type { AnalysisRunPersistence } from "../src/app/ports/analysisRunPersistence.js";

const originalWorkingDirectory = process.cwd();
const testWorkingDirectory = await mkdtemp(join(tmpdir(), "job-ai-assistant-flow-test-"));

process.env.LLM_MOCK = "true";
process.env.SAVE_INPUT_TEXT = "false";
process.chdir(testWorkingDirectory);

const { createAnalyzeJobApplication } = await import(
  "../src/app/analyzeJobApplication.js"
);
const { analyzeJobApplication } = await import("../src/legacy/analyzeJobApplication.js");

before(() => {
  process.chdir(testWorkingDirectory);
});

after(async () => {
  process.chdir(originalWorkingDirectory);
  await rm(testWorkingDirectory, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
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

test("web flow exposes only a safe structured workflow failure", async () => {
  process.env.ANALYSIS_MODE = "fast";
  process.env.MAX_REVISION_CYCLES = "2";

  await assert.rejects(
    analyzeJobApplication({
      resumeText: "Candidate has product delivery experience.",
      vacancyText: "The role requires product delivery and collaboration.",
      source: "web"
    }),
    (error) => {
      assert.ok(error instanceof WebAnalysisWorkflowError);
      assert.equal(error.llmErrorCode, "LLM_UNKNOWN_ERROR");
      assert.equal(error.stepName, "critic.v1");
      assert.equal(error.message, "LLM_UNKNOWN_ERROR");
      return true;
    }
  );
});

test("a compatible checkpoint retries Critic without rerunning Analyst or Producer", async () => {
  process.env.ANALYSIS_MODE = "fast";
  process.env.MAX_REVISION_CYCLES = "0";
  const checkpoints = new Map<string, { fingerprint: string; checkpoint: unknown }>();
  const firstSteps: string[] = [];
  const secondSteps: string[] = [];
  const persistenceFor = (steps: string[]): AnalysisRunPersistence => ({
    async initializeRun() {},
    async saveStepOutput(_runId, step) { steps.push(step.agentName); },
    async saveFinal() {},
    async saveMeta() {},
    async cleanupOldRuns() {},
  });
  const checkpointStore = {
    async load(runId: string) { return checkpoints.get(runId) ?? null; },
    async save(runId: string, fingerprint: string, checkpoint: unknown) {
      checkpoints.set(runId, { fingerprint, checkpoint });
    },
    async clear(runId: string) { checkpoints.delete(runId); },
  };
  const input = {
    resumeText: "Candidate has product delivery experience.",
    vacancyText: "The role requires product delivery and collaboration.",
    source: "web" as const,
  };

  await assert.rejects(
    createAnalyzeJobApplication({
      persistence: persistenceFor(firstSteps),
      createRunId: () => "checkpoint-run",
      checkpointStore,
    })(input),
  );
  const saved = checkpoints.get("checkpoint-run");
  assert.ok(saved !== undefined);
  const checkpointWithoutCritic = { ...(saved.checkpoint as Record<string, unknown>) };
  delete checkpointWithoutCritic.latestCriticResult;
  checkpoints.set("checkpoint-run", { ...saved, checkpoint: checkpointWithoutCritic });
  await assert.rejects(
    createAnalyzeJobApplication({
      persistence: persistenceFor(secondSteps),
      createRunId: () => "checkpoint-run",
      checkpointStore,
    })(input),
  );

  assert.deepEqual(firstSteps, ["analyst", "producer.v1", "critic.v1"]);
  assert.deepEqual(secondSteps, ["critic.v1"]);
});

test("a checkpoint is discarded when the model configuration changes", async () => {
  process.env.ANALYSIS_MODE = "fast";
  process.env.MAX_REVISION_CYCLES = "0";
  const previousModel = process.env.LLM_MODEL;
  const checkpoints = new Map<string, { fingerprint: string; checkpoint: unknown }>();
  const firstSteps: string[] = [];
  const secondSteps: string[] = [];
  const persistenceFor = (steps: string[]): AnalysisRunPersistence => ({
    async initializeRun() {},
    async saveStepOutput(_runId, step) { steps.push(step.agentName); },
    async saveFinal() {},
    async saveMeta() {},
    async cleanupOldRuns() {},
  });
  const checkpointStore = {
    async load(runId: string) { return checkpoints.get(runId) ?? null; },
    async save(runId: string, fingerprint: string, checkpoint: unknown) {
      checkpoints.set(runId, { fingerprint, checkpoint });
    },
    async clear(runId: string) { checkpoints.delete(runId); },
  };
  const input = {
    resumeText: "Candidate has product delivery experience.",
    vacancyText: "The role requires product delivery and collaboration.",
    source: "web" as const,
  };

  try {
    process.env.LLM_MODEL = "model-a";
    await assert.rejects(createAnalyzeJobApplication({ persistence: persistenceFor(firstSteps), createRunId: () => "model-run", checkpointStore })(input));
    process.env.LLM_MODEL = "model-b";
    await assert.rejects(createAnalyzeJobApplication({ persistence: persistenceFor(secondSteps), createRunId: () => "model-run", checkpointStore })(input));
  } finally {
    if (previousModel === undefined) delete process.env.LLM_MODEL;
    else process.env.LLM_MODEL = previousModel;
  }

  assert.deepEqual(secondSteps, ["analyst", "producer.v1", "critic.v1"]);
});

test("Mock revision flow stops after the third producer version", async () => {
  process.env.ANALYSIS_MODE = "deep";
  process.env.MAX_REVISION_CYCLES = "2";
  const progressEvents: AnalyzeJobApplicationProgressEvent[] = [];

  const persistenceEvents: string[] = [];
  let initializedRunId: string | undefined;
  const persistence: AnalysisRunPersistence = {
    async initializeRun({ runId }) {
      initializedRunId = runId;
      persistenceEvents.push("initializeRun");
    },
    async saveStepOutput() {
      persistenceEvents.push("saveStepOutput");
    },
    async saveFinal() {
      persistenceEvents.push("saveFinal");
    },
    async saveMeta() {
      persistenceEvents.push("saveMeta");
    },
    async cleanupOldRuns() {
      persistenceEvents.push("cleanupOldRuns");
    }
  };
  const analyzeWithPersistence = createAnalyzeJobApplication({
    persistence,
    createRunId: () => "fixed-run-id"
  });

  const result = await analyzeWithPersistence(
    {
      resumeText: "Candidate has product delivery experience.",
      vacancyText: "The role requires product delivery and collaboration.",
      source: "cli",
      onProgress: (event) => {
        progressEvents.push(event);
      }
    }
  );

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
  assert.equal(result.meta.runId, "fixed-run-id");
  assert.equal(initializedRunId, "fixed-run-id");
  assert.equal(persistenceEvents[0], "initializeRun");
  assert.equal(persistenceEvents[1], "saveMeta");
  assert.equal(
    persistenceEvents.filter((event) => event === "saveStepOutput").length,
    result.steps.length
  );
  assert.equal(
    persistenceEvents.filter((event) => event === "saveMeta").length,
    result.steps.length + 2
  );
  assert.deepEqual(persistenceEvents.slice(-2), ["saveMeta", "cleanupOldRuns"]);
});

test("default file persistence saves the final report for legacy adapters", async () => {
  process.env.ANALYSIS_MODE = "deep";
  process.env.MAX_REVISION_CYCLES = "2";

  const result = await analyzeJobApplication({
    resumeText: "Candidate has product delivery experience.",
    vacancyText: "The role requires product delivery and collaboration.",
    source: "cli"
  });
  const finalPath = join(
    testWorkingDirectory,
    "output",
    "runs",
    result.meta.runId,
    "final.md"
  );

  assert.equal(await readFile(finalPath, "utf8"), `${result.finalMarkdown}\n`);
});
