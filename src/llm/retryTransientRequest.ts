import type { LlmErrorCode } from "../types/jobApplication.js";

export type LlmAttemptMetrics = {
  attemptCount: number;
  retryErrorCodes: LlmErrorCode[];
};

export type TransientRetryEvent = {
  attempt: number;
  errorCode: "LLM_TIMEOUT" | "LLM_NETWORK_ERROR";
};

type RetryTransientRequestOptions = {
  maxAttempts: number;
  delayMs: number;
  onRetry?: (event: TransientRetryEvent) => void;
};

const networkErrorCodes = new Set([
  "ECONNABORTED",
  "ECONNREFUSED",
  "ECONNRESET",
  "EAI_AGAIN",
  "EHOSTUNREACH",
  "ENETUNREACH",
  "ENOTFOUND"
]);

export function createLlmAttemptMetrics(): LlmAttemptMetrics {
  return {
    attemptCount: 0,
    retryErrorCodes: []
  };
}

export async function retryTransientRequest<T>(
  execute: () => Promise<T>,
  options: RetryTransientRequestOptions
): Promise<T> {
  for (let attempt = 1; attempt <= options.maxAttempts; attempt += 1) {
    try {
      return await execute();
    } catch (error) {
      const errorCode = classifyLlmError(error);
      const canRetry =
        attempt < options.maxAttempts &&
        (errorCode === "LLM_TIMEOUT" || errorCode === "LLM_NETWORK_ERROR");

      if (!canRetry) {
        throw error;
      }

      options.onRetry?.({ attempt, errorCode });
      await delay(options.delayMs);
    }
  }

  throw new Error("Transient LLM retry exhausted without an execution attempt.");
}

export function classifyLlmError(error: unknown): LlmErrorCode {
  const details = getErrorDetails(error);

  if (
    details.code === "ETIMEDOUT" ||
    details.name.toLowerCase().includes("abort") ||
    /timed out|timeout|request was aborted/i.test(details.message)
  ) {
    return "LLM_TIMEOUT";
  }

  if (
    networkErrorCodes.has(details.code) ||
    /fetch failed|network error|api connection error|socket hang up|connection reset|connection refused/i.test(
      `${details.name} ${details.message}`
    )
  ) {
    return "LLM_NETWORK_ERROR";
  }

  if (
    /LLM returned|invalid .*contract|does not contain a JSON object|incomplete JSON object/i.test(details.message)
  ) {
    return "LLM_RESPONSE_INVALID";
  }

  return "LLM_UNKNOWN_ERROR";
}

function getErrorDetails(error: unknown): { code: string; name: string; message: string } {
  if (error instanceof Error) {
    const record = error as Error & { code?: unknown; cause?: unknown };
    const cause = record.cause;
    const causeCode = getProperty(cause, "code");

    return {
      code: getString(record.code) ?? getString(causeCode) ?? "",
      name: error.name,
      message: error.message
    };
  }

  return {
    code: getString(getProperty(error, "code")) ?? "",
    name: getString(getProperty(error, "name")) ?? "",
    message: getString(getProperty(error, "message")) ?? String(error)
  };
}

function getProperty(value: unknown, key: string): unknown {
  return typeof value === "object" && value !== null ? (value as Record<string, unknown>)[key] : undefined;
}

function getString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function delay(delayMs: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, delayMs));
}
