import assert from "node:assert/strict";
import test from "node:test";
import {
  classifyLlmError,
  retryTransientRequest
} from "../../src/llm/retryTransientRequest.js";

test("classifies timeout and network errors without recording error text", () => {
  const timeoutError = new Error("LLM step timed out after 1000ms.");
  const networkError = Object.assign(new Error("fetch failed"), { code: "ECONNRESET" });

  assert.equal(classifyLlmError(timeoutError), "LLM_TIMEOUT");
  assert.equal(classifyLlmError(networkError), "LLM_NETWORK_ERROR");
});

test("retries one transient network failure with the same operation", async () => {
  let calls = 0;
  const retryEvents: string[] = [];

  const result = await retryTransientRequest(
    async () => {
      calls += 1;

      if (calls === 1) {
        throw Object.assign(new Error("fetch failed"), { code: "ECONNRESET" });
      }

      return "completed-once";
    },
    {
      maxAttempts: 2,
      delayMs: 0,
      onRetry: ({ errorCode }) => retryEvents.push(errorCode)
    }
  );

  assert.equal(result, "completed-once");
  assert.equal(calls, 2);
  assert.deepEqual(retryEvents, ["LLM_NETWORK_ERROR"]);
});

test("does not retry a non-transient LLM response error", async () => {
  let calls = 0;

  await assert.rejects(
    retryTransientRequest(
      async () => {
        calls += 1;
        throw new Error("LLM returned an empty response.");
      },
      {
        maxAttempts: 2,
        delayMs: 0
      }
    ),
    /empty response/
  );

  assert.equal(calls, 1);
});
