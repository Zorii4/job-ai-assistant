import assert from "node:assert/strict";
import test from "node:test";
import { criticResultSchema } from "../../src/contracts/critic.contract.js";

const validIssue = {
  category: "Facts",
  severity: "Major",
  problem: "The draft includes an unsupported claim.",
  reason: "The supplied documents do not confirm it.",
  requiredAction: "Remove the unsupported claim.",
  reference: "Producer draft, opening paragraph."
};

test("Critic contract accepts an approved result without issues", () => {
  const result = criticResultSchema.safeParse({
    schemaVersion: 1,
    decision: "APPROVED",
    issues: [],
    summary: "The materials are consistent with the supplied facts."
  });

  assert.equal(result.success, true);
});

test("Critic contract accepts a revision result with a complete issue", () => {
  const result = criticResultSchema.safeParse({
    schemaVersion: 1,
    decision: "NEEDS_REVISION",
    issues: [validIssue],
    summary: "One factual correction is required."
  });

  assert.equal(result.success, true);
});

test("Critic contract rejects a result with a missing required field", () => {
  const result = criticResultSchema.safeParse({
    schemaVersion: 1,
    decision: "APPROVED",
    issues: []
  });

  assert.equal(result.success, false);
});

test("Critic contract rejects unexpected fields", () => {
  const result = criticResultSchema.safeParse({
    schemaVersion: 1,
    decision: "APPROVED",
    issues: [],
    summary: "The materials are consistent with the supplied facts.",
    internalNote: "Do not expose this field."
  });

  assert.equal(result.success, false);
});

test("Critic contract rejects an approved result that contains issues", () => {
  const result = criticResultSchema.safeParse({
    schemaVersion: 1,
    decision: "APPROVED",
    issues: [validIssue],
    summary: "The materials are approved."
  });

  assert.equal(result.success, false);
});

test("Critic contract rejects a revision result without issues", () => {
  const result = criticResultSchema.safeParse({
    schemaVersion: 1,
    decision: "NEEDS_REVISION",
    issues: [],
    summary: "A revision is required."
  });

  assert.equal(result.success, false);
});
