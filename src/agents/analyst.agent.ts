import { callLLMJson } from "../llm/llmClient.js";
import {
  recoverStructuredResponseOnce,
  retryTechnicalLlmFailureWithFallback
} from "../llm/retryStructuredResponse.js";
import { createLlmAttemptMetrics } from "../llm/retryTransientRequest.js";
import { analystResultSchema, type AnalystResult } from "../contracts/analyst.contract.js";
import type { AgentExecutionOptions, AgentExecutionResult, JobApplicationDocuments } from "../types/jobApplication.js";

const analystRecoveryInstruction = `
# Technical recovery

The previous response did not pass the AnalystResult JSON contract. Re-run the same analysis without changing its factual criteria.

Return one complete valid AnalystResult JSON object for schemaVersion 1. Do not omit required fields. Do not return Markdown or explanatory text.
`.trim();

export async function analystAgent(
  documents: JobApplicationDocuments,
  options: AgentExecutionOptions,
  systemPrompt: string
): Promise<AgentExecutionResult<AnalystResult>> {
  const userPrompt = `
Resume:
${documents.resumeText}

Vacancy:
${documents.vacancyText}
  `.trim();
  const llmMetrics = createLlmAttemptMetrics();
  const callAnalyst = (prompt: string, model?: string) =>
    callLLMJson(prompt, userPrompt, analystResultSchema, "AnalystResult", {
      maxOutputTokens: options.maxOutputTokens,
      timeoutMs: options.timeoutMs,
      model,
      transientRetryMaxAttempts: 1,
      metrics: llmMetrics
    });
  const executeRoute = (model?: string) =>
    recoverStructuredResponseOnce(
      () => callAnalyst(systemPrompt, model),
      () => callAnalyst(`${systemPrompt}\n\n${analystRecoveryInstruction}`, model),
      ({ errorCode }) => {
        llmMetrics.retryErrorCodes.push(errorCode);
        console.warn(`[analyst] technical recovery after ${errorCode}`);
      }
    );
  const fallbackModel = getAnalystFallbackModel();
  const response = fallbackModel === undefined
    ? await executeRoute()
    : await retryTechnicalLlmFailureWithFallback(
        () => executeRoute(),
        () => executeRoute(fallbackModel),
        (errorCode) => {
          llmMetrics.retryErrorCodes.push(errorCode);
          console.warn(`[analyst] switching to configured fallback model after ${errorCode}`);
        }
      );
  const outputText = JSON.stringify(response.data, null, 2);

  return {
    output: response.data,
    outputText,
    inputChars: systemPrompt.length + userPrompt.length,
    outputChars: response.raw.length,
    attemptCount: llmMetrics.attemptCount,
    retryErrorCodes: llmMetrics.retryErrorCodes
  };
}

function getAnalystFallbackModel(): string | undefined {
  const fallbackModel = process.env.LLM_ANALYST_FALLBACK_MODEL?.trim();
  const primaryModel = process.env.LLM_MODEL?.trim();

  if (!fallbackModel || fallbackModel === primaryModel) {
    return undefined;
  }

  return fallbackModel;
}
