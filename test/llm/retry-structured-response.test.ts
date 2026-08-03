import assert from "node:assert/strict";
import test from "node:test";
import { StructuredResponseValidationError } from "../../src/llm/llmClient.js";
import { retryStructuredResponse } from "../../src/llm/retryStructuredResponse.js";

test("retries one invalid structured LLM response", async () => {
  let calls = 0;
  const retryEvents: string[] = [];

  const result = await retryStructuredResponse(
    async () => {
      calls += 1;
      if (calls === 1) {
        throw new Error("LLM response contains an incomplete JSON object.");
      }

      return "valid";
    },
    async () => "recovered",
    ({ phase }) => retryEvents.push(phase)
  );

  assert.equal(result, "valid");
  assert.equal(calls, 2);
  assert.deepEqual(retryEvents, ["retry"]);
});

test("does not retry a non-structured LLM error", async () => {
  let calls = 0;

  await assert.rejects(
    retryStructuredResponse(
      async () => {
        calls += 1;
        throw new Error("LLM step timed out after 1000ms.");
      },
      async () => "recovered"
    ),
    /timed out/
  );

  assert.equal(calls, 1);
});

test("uses one recovery attempt after two invalid structured responses", async () => {
  let calls = 0;
  const retryEvents: string[] = [];

  const result = await retryStructuredResponse(
    async () => {
      calls += 1;
      throw new Error("LLM returned an invalid CriticResult contract: evidence is required");
    },
    async () => "recovered",
    ({ phase }) => retryEvents.push(phase)
  );

  assert.equal(calls, 2);
  assert.equal(result, "recovered");
  assert.deepEqual(retryEvents, ["retry", "recovery"]);
});

test("retries a validation error without exposing a model response", async () => {
  let calls = 0;

  const result = await retryStructuredResponse(
    async () => {
      calls += 1;
      if (calls === 1) {
        throw new StructuredResponseValidationError("AnalystResult", ["scores.atsMatch: required"]);
      }

      return "valid";
    },
    async () => "recovered"
  );

  assert.equal(result, "valid");
  assert.equal(calls, 2);
});
