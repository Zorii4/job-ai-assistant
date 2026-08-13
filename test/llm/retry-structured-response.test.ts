import assert from "node:assert/strict";
import test from "node:test";
import {
  LlmTruncatedResponseError,
  StructuredResponseValidationError
} from "../../src/llm/llmClient.js";
import {
  retryStructuredResponse,
  retryCriticBudgetFailureWithFallback
} from "../../src/llm/retryStructuredResponse.js";

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

test("switches to the fallback when the primary response is truncated", async () => {
  let fallbackCalls = 0;

  const result = await retryCriticBudgetFailureWithFallback(
    async () => {
      throw new LlmTruncatedResponseError();
    },
    async () => {
      fallbackCalls += 1;
      return "fallback-valid";
    }
  );

  assert.equal(result, "fallback-valid");
  assert.equal(fallbackCalls, 1);
});

test("switches to the fallback when the primary response times out", async () => {
  const result = await retryCriticBudgetFailureWithFallback(
    async () => {
      throw new Error("LLM step timed out after 60000ms.");
    },
    async () => "fallback-valid"
  );

  assert.equal(result, "fallback-valid");
});

test("does not switch models for an ordinary contract validation error", async () => {
  let fallbackCalls = 0;

  await assert.rejects(
    retryCriticBudgetFailureWithFallback(
      async () => {
        throw new StructuredResponseValidationError("CriticResult", ["root: invalid"]);
      },
      async () => {
        fallbackCalls += 1;
        return "fallback-valid";
      }
    ),
    /invalid CriticResult/
  );

  assert.equal(fallbackCalls, 0);
});
