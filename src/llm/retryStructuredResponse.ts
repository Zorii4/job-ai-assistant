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

function isInvalidStructuredResponse(error: unknown): boolean {
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
