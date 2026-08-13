import assert from "node:assert/strict";
import test from "node:test";
import {
  criticFindingsSchema,
  criticResultSchema,
  finalizeCriticResult
} from "../../src/contracts/critic.contract.js";

const validWarningIssue = {
  category: "Structure" as const,
  severity: "WARNING" as const,
  problem: "The draft leaves one resume block as recommendations.",
  reason: "The user still needs copy-paste text before sending.",
  requiredAction: "Replace the recommendations with a ready-to-use block.",
  reference: "Resume recommendations section."
};

const validClaimAuditEntry = {
  claim: "The candidate built reusable table components.",
  material: "ResumeRecommendations" as const,
  classification: "SUPPORTED_AMPLIFICATION" as const,
  severity: "INFO" as const,
  evidence: [{ source: "resume" as const, quote: "Built a table with filtering and sorting." }],
  reason: "The claim keeps the documented scope and improves the wording.",
  requiredAction: ""
};

function approvedResult(overrides: Record<string, unknown> = {}) {
  return {
    schemaVersion: 3,
    decision: "APPROVED",
    reviewStatus: "GOOD",
    issues: [],
    claimAudit: [validClaimAuditEntry],
    summary: "The materials are consistent with the supplied facts.",
    ...overrides
  };
}

test("Critic contract accepts an approved result without critical findings", () => {
  assert.equal(criticResultSchema.safeParse(approvedResult()).success, true);
});

test("Critic findings omit derived status fields and finalize them deterministically", () => {
  const findings = criticFindingsSchema.parse({
    schemaVersion: 3,
    issues: [validWarningIssue],
    claimAudit: [validClaimAuditEntry],
    summary: "One warning remains before the materials are ready."
  });

  assert.deepEqual(finalizeCriticResult(findings), {
    ...findings,
    decision: "APPROVED",
    reviewStatus: "NEEDS_REVIEW"
  });
});

test("Critic finalization requires revision for a critical finding by construction", () => {
  const findings = criticFindingsSchema.parse({
    schemaVersion: 3,
    issues: [],
    claimAudit: [
      {
        ...validClaimAuditEntry,
        classification: "UNSUPPORTED",
        severity: "CRITICAL",
        evidence: [],
        requiredAction: "Remove the unsupported claim."
      }
    ],
    summary: "A critical unsupported claim must be removed."
  });
  const result = finalizeCriticResult(findings);

  assert.equal(result.decision, "NEEDS_REVISION");
  assert.equal(result.reviewStatus, "REJECTED");
  assert.equal(criticResultSchema.safeParse(result).success, true);
});

test("Critic contract accepts warnings without blocking approval", () => {
  const result = criticResultSchema.safeParse(
    approvedResult({
      reviewStatus: "NEEDS_REVIEW",
      issues: [validWarningIssue],
      claimAudit: [{ ...validClaimAuditEntry, severity: "WARNING" }]
    })
  );

  assert.equal(result.success, true);
});

test("Critic contract accepts an unsupported warning without a revision", () => {
  const result = criticResultSchema.safeParse(
    approvedResult({
      reviewStatus: "NEEDS_REVIEW",
      claimAudit: [
        {
          ...validClaimAuditEntry,
          classification: "UNSUPPORTED",
          severity: "WARNING",
          evidence: [],
          requiredAction: "Replace the claim with a safe conditional."
        }
      ]
    })
  );

  assert.equal(result.success, true);
});

test("Critic contract accepts a revision result for a critical claim", () => {
  const result = criticResultSchema.safeParse(
    approvedResult({
      decision: "NEEDS_REVISION",
      reviewStatus: "REJECTED",
      issues: [{ ...validWarningIssue, category: "Facts", severity: "CRITICAL" }],
      claimAudit: [
        {
          ...validClaimAuditEntry,
          classification: "UNSUPPORTED",
          severity: "CRITICAL",
          evidence: [],
          requiredAction: "Remove the invented commercial experience."
        }
      ]
    })
  );

  assert.equal(result.success, true);
});

test("Critic contract rejects a result with a missing required field", () => {
  const result = criticResultSchema.safeParse({
    schemaVersion: 3,
    decision: "APPROVED",
    reviewStatus: "GOOD",
    issues: [],
    claimAudit: [validClaimAuditEntry]
  });

  assert.equal(result.success, false);
});

test("Critic contract rejects unexpected fields", () => {
  const result = criticResultSchema.safeParse(
    approvedResult({ internalNote: "Do not expose this field." })
  );

  assert.equal(result.success, false);
});

test("Critic contract limits audit volume and field sizes", () => {
  const tooManyClaims = Array.from({ length: 17 }, () => validClaimAuditEntry);
  const oversizedSummary = "x".repeat(1_501);

  assert.equal(criticResultSchema.safeParse(approvedResult({ claimAudit: tooManyClaims })).success, false);
  assert.equal(criticResultSchema.safeParse(approvedResult({ summary: oversizedSummary })).success, false);
});

test("Critic contract rejects approved output with a critical finding", () => {
  const result = criticResultSchema.safeParse(
    approvedResult({
      claimAudit: [
        {
          ...validClaimAuditEntry,
          classification: "UNSUPPORTED",
          severity: "CRITICAL",
          evidence: [],
          requiredAction: "Remove the false claim."
        }
      ]
    })
  );

  assert.equal(result.success, false);
});

test("Critic contract rejects a revision result without a critical finding", () => {
  const result = criticResultSchema.safeParse(
    approvedResult({ decision: "NEEDS_REVISION", reviewStatus: "NEEDS_REVIEW", issues: [validWarningIssue] })
  );

  assert.equal(result.success, false);
});

test("Critic contract requires evidence for supported amplification", () => {
  const result = criticResultSchema.safeParse(
    approvedResult({ claimAudit: [{ ...validClaimAuditEntry, evidence: [] }] })
  );

  assert.equal(result.success, false);
});

test("Critic contract accepts every non-critical claim classification", () => {
  const allowedClassifications = [
    "DIRECT",
    "SAFE_PARAPHRASE",
    "SUPPORTED_AMPLIFICATION",
    "SUPPORTED_INFERENCE",
    "CONDITIONAL"
  ];

  const result = criticResultSchema.safeParse(
    approvedResult({
      claimAudit: allowedClassifications.map((classification) => ({
        ...validClaimAuditEntry,
        classification,
        claim: `A ${classification} claim.`
      }))
    })
  );

  assert.equal(result.success, true);
});

test("Critic contract requires material misrepresentation to be critical", () => {
  const result = criticResultSchema.safeParse(
    approvedResult({
      decision: "NEEDS_REVISION",
      reviewStatus: "REJECTED",
      issues: [{ ...validWarningIssue, category: "Facts", severity: "CRITICAL" }],
      claimAudit: [
        {
          ...validClaimAuditEntry,
          classification: "MATERIAL_MISREPRESENTATION",
          severity: "WARNING",
          evidence: [],
          requiredAction: "Remove the false claim."
        }
      ]
    })
  );

  assert.equal(result.success, false);
});

test("Critic contract requires an action for a critical claim", () => {
  const result = criticResultSchema.safeParse(
    approvedResult({
      decision: "NEEDS_REVISION",
      reviewStatus: "REJECTED",
      issues: [{ ...validWarningIssue, category: "Facts", severity: "CRITICAL" }],
      claimAudit: [
        {
          ...validClaimAuditEntry,
          classification: "UNSUPPORTED",
          severity: "CRITICAL",
          evidence: [],
          requiredAction: ""
        }
      ]
    })
  );

  assert.equal(result.success, false);
});
