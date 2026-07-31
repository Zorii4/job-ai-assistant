import { callLLMJson } from "../llm/llmClient.js";
import { retryStructuredResponse } from "../llm/retryStructuredResponse.js";
import { createLlmAttemptMetrics } from "../llm/retryTransientRequest.js";
import type { AnalystResult } from "../contracts/analyst.contract.js";
import { criticResultSchema, type CriticResult } from "../contracts/critic.contract.js";
import type { AgentExecutionOptions, AgentExecutionResult, JobApplicationDocuments } from "../types/jobApplication.js";

const criticRecoveryInstruction = `
# Technical recovery

The previous response did not pass the CriticResult schema. Re-run the same audit without changing its factual criteria.

Return only one complete valid CriticResult JSON object for schemaVersion 3. The claimAudit field is mandatory and must contain at least one complete entry. Preserve the distinction between classification and severity; do not omit required fields.
`.trim();

export async function criticAgent(
  documents: JobApplicationDocuments,
  analystResult: AnalystResult,
  producerOutput: string,
  producerVersion: number,
  options: AgentExecutionOptions,
  systemPrompt: string
): Promise<AgentExecutionResult<CriticResult>> {
  const userPrompt = `
Producer version:
producer.v${producerVersion}

Resume:
${documents.resumeText}

Vacancy:
${documents.vacancyText}

analystAgent output:
${JSON.stringify(analystResult, null, 2)}

producerAgent output:
${producerOutput}
`.trim();
  const llmMetrics = createLlmAttemptMetrics();
  const callCritic = (systemPrompt: string) =>
      callLLMJson(
        systemPrompt,
        userPrompt,
        criticResultSchema,
        "CriticResult",
        {
          maxOutputTokens: options.maxOutputTokens,
          timeoutMs: options.timeoutMs,
          jsonMode: process.env.LLM_CRITIC_JSON_MODE === "true",
          metrics: llmMetrics
        }
      );
  const response = await retryStructuredResponse(
    () => callCritic(systemPrompt),
    () => callCritic(`${systemPrompt}\n\n${criticRecoveryInstruction}`),
    ({ phase, errorCode }) => {
      llmMetrics.retryErrorCodes.push(errorCode);
      console.warn(`[critic] technical ${phase} after ${errorCode}`);
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
