import { callLLM } from "../llm/llmClient.js";
import { createLlmAttemptMetrics } from "../llm/retryTransientRequest.js";
import type { AnalystResult } from "../contracts/analyst.contract.js";
import type { CriticResult } from "../contracts/critic.contract.js";
import type { AgentExecutionOptions, AgentExecutionResult, JobApplicationDocuments } from "../types/jobApplication.js";

export async function producerAgent(
  documents: JobApplicationDocuments,
  analystResult: AnalystResult,
  options: AgentExecutionOptions,
  systemPrompt: string,
  previousProducerOutput?: string,
  criticFeedback?: CriticResult
): Promise<AgentExecutionResult> {
  const userPrompt = `
Resume:
${documents.resumeText}

Vacancy:
${documents.vacancyText}

analystAgent output:
${JSON.stringify(analystResult, null, 2)}

Previous producerAgent output:
${previousProducerOutput ?? "No previous producer output."}

criticAgent feedback:
${criticFeedback ? JSON.stringify(criticFeedback, null, 2) : "No critic feedback yet."}
`.trim();
  const llmMetrics = createLlmAttemptMetrics();
  const output = await callLLM(systemPrompt, userPrompt, {
    maxOutputTokens: options.maxOutputTokens,
    timeoutMs: options.timeoutMs,
    metrics: llmMetrics
  });

  return {
    output,
    outputText: output,
    inputChars: systemPrompt.length + userPrompt.length,
    outputChars: output.length,
    attemptCount: llmMetrics.attemptCount,
    retryErrorCodes: llmMetrics.retryErrorCodes
  };
}
