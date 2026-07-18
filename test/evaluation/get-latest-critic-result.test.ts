import assert from "node:assert/strict";
import test from "node:test";
import { getLatestCriticResult } from "../../src/evaluation/getLatestCriticResult.js";
import type { JobApplicationStep } from "../../src/types/jobApplication.js";

const criticResult = {
  schemaVersion: 3,
  decision: "APPROVED",
  reviewStatus: "GOOD",
  issues: [],
  claimAudit: [
    {
      claim: "The candidate built reusable components.",
      material: "ResumeRecommendations",
      classification: "DIRECT",
      severity: "INFO",
      evidence: [{ source: "resume", quote: "Built reusable components." }],
      reason: "The claim follows directly from the resume.",
      requiredAction: ""
    }
  ],
  summary: "The materials are approved."
};

function createStep(agentName: JobApplicationStep["agentName"], output: string): JobApplicationStep {
  return {
    agentName,
    output,
    startedAt: "2026-07-18T00:00:00.000Z",
    finishedAt: "2026-07-18T00:00:01.000Z",
    durationMs: 1000,
    inputChars: 10,
    outputChars: output.length
  };
}

test("extracts and validates the latest Critic result", () => {
  const olderCriticResult = { ...criticResult, summary: "Older Critic result." };
  const result = getLatestCriticResult([
    createStep("critic.v1", JSON.stringify(olderCriticResult)),
    createStep("producer.v2", "Second producer draft."),
    createStep("critic.v2", JSON.stringify(criticResult))
  ]);

  assert.equal(result.summary, "The materials are approved.");
  assert.equal(result.claimAudit.length, 1);
});

test("rejects a missing Critic step", () => {
  assert.throws(
    () => getLatestCriticResult([createStep("producer.v1", "Producer draft.")]),
    /does not contain a Critic step/
  );
});

test("rejects a malformed Critic step", () => {
  assert.throws(
    () => getLatestCriticResult([createStep("critic.v1", "not json")]),
    /does not contain valid JSON/
  );
});
