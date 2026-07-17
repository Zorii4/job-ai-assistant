import assert from "node:assert/strict";
import test from "node:test";
import { analystResultSchema } from "../../src/contracts/analyst.contract.js";

const validAnalystResult = {
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
};

test("Analyst contract accepts a complete valid result", () => {
  const result = analystResultSchema.safeParse(validAnalystResult);

  assert.equal(result.success, true);
});

test("Analyst contract rejects a result with a missing required field", () => {
  const resultWithoutVerdict: Record<string, unknown> = { ...validAnalystResult };
  delete resultWithoutVerdict.verdict;

  const result = analystResultSchema.safeParse(resultWithoutVerdict);

  assert.equal(result.success, false);
});

test("Analyst contract rejects unexpected nested fields", () => {
  const resultWithUnexpectedScoreField = {
    ...validAnalystResult,
    scores: {
      ...validAnalystResult.scores,
      atsMatch: {
        ...validAnalystResult.scores.atsMatch,
        confidence: "high"
      }
    }
  };

  const result = analystResultSchema.safeParse(resultWithUnexpectedScoreField);

  assert.equal(result.success, false);
});
