import assert from "node:assert/strict";
import test from "node:test";
import { analystResultSchema } from "../src/contracts/analyst.contract.js";
import { createFinalPrompt } from "../src/agents/orchestrator.agent.js";
import { hasUnsafeFinalOutput } from "../src/telegram/guards/outputGuard.js";

const analystResult = analystResultSchema.parse({
  schemaVersion: 1,
  recommendation: "LIKELY_APPLY",
  priority: "MEDIUM",
  verdict: "The candidate has relevant experience for the role.",
  limitations: ["The vacancy does not specify the team size."],
  scores: {
    atsMatch: { score: 7, reason: "Relevant keywords are present." },
    vacancyMatch: { score: 8, reason: "Core requirements are covered." },
    recruiterAppeal: { score: 7, reason: "Experience is clearly described." },
    interviewProbability: { score: 6, reason: "Some requirements need clarification." },
    offerPotential: { score: 6, reason: "The final outcome depends on interviews." }
  },
  companyNeeds: ["Deliver a reliable product feature."],
  companyAnalysis: ["The role expects cross-functional communication."],
  gaps: [
    {
      requirement: "Experience with a specific reporting tool.",
      status: "PARTIAL",
      evidence: "Related reporting experience is listed.",
      impact: "The candidate should explain transferable experience."
    }
  ],
  strengths: ["Relevant product delivery experience."],
  risks: ["The exact reporting tool is not confirmed."],
  keyRecommendations: ["Emphasize measurable delivery outcomes."],
  additionalImprovements: ["Clarify the scope of recent projects."],
  producerBrief: {
    positioning: "Position the candidate as a delivery-focused specialist.",
    mustEmphasize: ["Cross-functional collaboration."],
    vacancyKeywords: ["product delivery"],
    prohibitedClaims: ["Do not claim experience with unconfirmed tools."]
  },
  criticChecklist: ["Check every claim against the supplied documents."]
});

test("Final Orchestrator prompt does not forward Critic data", () => {
  const criticPrivateMarker = "CRITIC_PRIVATE_MARKER_DO_NOT_FORWARD";
  const inputWithCriticData = {
    mode: "final",
    resumeText: "Candidate has product delivery experience.",
    vacancyText: "The role requires product delivery and collaboration.",
    analystResult,
    latestProducerOutput: "Final application materials.",
    latestCriticResult: criticPrivateMarker,
    criticHistory: criticPrivateMarker,
    finalDecision: criticPrivateMarker
  } as const;
  const prompt = createFinalPrompt(inputWithCriticData);

  assert.doesNotMatch(prompt, new RegExp(criticPrivateMarker));
  assert.doesNotMatch(prompt, /Latest critic contract/i);
  assert.doesNotMatch(prompt, /Critic revision history/i);
});

test("Final output guard rejects internal Critic and revision markers", () => {
  const unsafeOutputs = [
    "CRITIC: unresolved note",
    "Критик запросил доработку.",
    "producer.v2 completed",
    "REVISION REQUIRED",
    "DECISION: APPROVED"
  ];

  for (const output of unsafeOutputs) {
    assert.equal(hasUnsafeFinalOutput(output), true, output);
  }

  assert.equal(hasUnsafeFinalOutput("# Готовые материалы\n\nТекст для отклика."), false);
});
