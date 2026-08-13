import { LlmTruncatedResponseError, StructuredResponseValidationError } from "./llmClient.js";

export type StructuredResponseRetryEvent = {
  phase: "retry" | "recovery";
  errorCode: "LLM_RESPONSE_INVALID";
};

export async function retryStructuredResponse<T>(
  execute: () => Promise<T>,
  recover: () => Promise<T>,
  onRetry?: (event: StructuredResponseRetryEvent) => void
): Promise<T> {
  try {
    return await execute();
  } catch (error) {
    if (!isInvalidStructuredResponse(error)) {
      throw error;
    }

    onRetry?.({ phase: "retry", errorCode: "LLM_RESPONSE_INVALID" });
  }

  try {
    return await execute();
  } catch (error) {
    if (!isInvalidStructuredResponse(error)) {
      throw error;
    }

    onRetry?.({ phase: "recovery", errorCode: "LLM_RESPONSE_INVALID" });
  }

  return recover();
}

export async function retryCriticBudgetFailureWithFallback<T>(
  execute: () => Promise<T>,
  fallback: () => Promise<T>,
  onFallback?: () => void
): Promise<T> {
  try {
    return await execute();
  } catch (error) {
    if (!isCriticBudgetFailure(error)) {
      throw error;
    }

    onFallback?.();
    return fallback();
  }
}

function isCriticBudgetFailure(error: unknown): boolean {
  return (
    error instanceof LlmTruncatedResponseError ||
    (error instanceof Error && /LLM step timed out after \d+ms\./.test(error.message))
  );
}

function isInvalidStructuredResponse(error: unknown): boolean {
  if (error instanceof StructuredResponseValidationError) {
    return true;
  }

  if (!(error instanceof Error)) {
    return false;
  }

  return (
    error.message.startsWith("LLM returned invalid JSON") ||
    error.message.startsWith("LLM returned an invalid ") ||
    error.message === "LLM returned an empty response." ||
    error.message === "LLM response does not contain a JSON object." ||
    error.message === "LLM response contains an incomplete JSON object."
  );
}
