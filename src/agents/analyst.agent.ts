import { callLLMJson } from "../llm/llmClient.js";
import { createLlmAttemptMetrics } from "../llm/retryTransientRequest.js";
import { analystResultSchema, type AnalystResult } from "../contracts/analyst.contract.js";
import type { AgentExecutionOptions, AgentExecutionResult, JobApplicationDocuments } from "../types/jobApplication.js";

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
  const response = await callLLMJson(
    systemPrompt,
    userPrompt,
    analystResultSchema,
    "AnalystResult",
    {
      maxOutputTokens: options.maxOutputTokens,
      timeoutMs: options.timeoutMs,
      metrics: llmMetrics
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
