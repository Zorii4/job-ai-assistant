import { callLLMJson } from "../llm/llmClient.js";
import {
  retryStructuredResponse,
  retryCriticBudgetFailureWithFallback
} from "../llm/retryStructuredResponse.js";
import { createLlmAttemptMetrics } from "../llm/retryTransientRequest.js";
import type { AnalystResult } from "../contracts/analyst.contract.js";
import {
  criticFindingsSchema,
  criticResultSchema,
  finalizeCriticResult,
  type CriticResult
} from "../contracts/critic.contract.js";
import type { AgentExecutionOptions, AgentExecutionResult, JobApplicationDocuments } from "../types/jobApplication.js";

const criticRecoveryInstruction = `
# Technical recovery

The previous response did not pass the Critic findings schema. Re-run the same audit without changing its factual criteria.

Return only one complete valid CriticFindings JSON object for schemaVersion 3. Include issues, claimAudit, and summary; do not include decision or reviewStatus because the application derives them from the findings. The claimAudit field is mandatory and must contain at least one complete entry. Preserve the distinction between classification and severity; do not omit required fields.
`.trim();

const criticOutputContractInstruction = `
# Required Critic output protocol

Return only one complete CriticFindings JSON object for schemaVersion 3.
Do not return decision or reviewStatus: the application derives both deterministically from the findings.
Audit 3 to 6 representative, high-risk claims across the complete producer package. Always include any claim that could materially misrepresent the candidate, even when it is not among the representative claims.
Keep every field concise and do not repeat evidence.
`.trim();

export async function criticAgent(
  documents: JobApplicationDocuments,
  analystResult: AnalystResult,
  producerOutput: string,
  producerVersion: number,
  options: AgentExecutionOptions,
  systemPrompt: string
): Promise<AgentExecutionResult<CriticResult>> {
  const effectiveCriticInstructions = `${systemPrompt}\n\n${criticOutputContractInstruction}`;
  const userPrompt = createCriticPrompt(documents, analystResult, producerOutput, producerVersion);
  const fallbackUserPrompt = createCriticPrompt(
    documents,
    analystResult,
    producerOutput,
    producerVersion,
    getFallbackContextLimit()
  );
  const llmMetrics = createLlmAttemptMetrics();
  const callCritic = (
    systemPrompt: string,
    model?: string,
    prompt = userPrompt,
    maxOutputTokens = options.maxOutputTokens,
    timeoutMs = options.timeoutMs
  ) =>
      callLLMJson(
        systemPrompt,
        prompt,
        criticFindingsSchema,
        "CriticFindings",
        {
          maxOutputTokens,
          timeoutMs,
          model,
          transientRetryMaxAttempts: 1,
          metrics: llmMetrics
        }
      );
  const executeCritic = (
    model?: string,
    prompt = userPrompt,
    maxOutputTokens = options.maxOutputTokens,
    timeoutMs = getCriticTimeoutMs()
  ) =>
    retryStructuredResponse(
      () => callCritic(effectiveCriticInstructions, model, prompt, maxOutputTokens, timeoutMs),
      () => callCritic(`${effectiveCriticInstructions}\n\n${criticRecoveryInstruction}`, model, prompt, maxOutputTokens, timeoutMs),
      ({ phase, errorCode }) => {
        llmMetrics.retryErrorCodes.push(errorCode);
        console.warn(`[critic] technical ${phase} after ${errorCode}`);
      }
    );
  const response = await retryCriticBudgetFailureWithFallback(
    () => executeCritic(getCriticPrimaryModel()),
    () => executeCritic(
      getCriticFallbackModel(),
      fallbackUserPrompt,
      getFallbackOutputLimit(options.maxOutputTokens)
    ),
    () => {
      llmMetrics.retryErrorCodes.push("LLM_TIMEOUT");
      console.warn("[critic] switching to configured fallback model after primary budget failure");
    }
  );
  const output = finalizeCriticResult(response.data);
  const parsedOutput = criticResultSchema.parse(output);
  const outputText = JSON.stringify(parsedOutput, null, 2);

  return {
    output: parsedOutput,
    outputText,
    inputChars: systemPrompt.length + userPrompt.length,
    outputChars: response.raw.length,
    attemptCount: llmMetrics.attemptCount,
    retryErrorCodes: llmMetrics.retryErrorCodes
  };
}

function getCriticPrimaryModel(): string {
  return process.env.LLM_CRITIC_MODEL?.trim() || "gpt-oss-20b";
}

function getCriticFallbackModel(): string {
  return process.env.LLM_CRITIC_FALLBACK_MODEL?.trim() || "deepseek-v4-flash";
}

function getCriticTimeoutMs(): number {
  return parsePositiveInteger(process.env.LLM_CRITIC_TIMEOUT_MS, 60_000);
}

function getFallbackContextLimit(): number {
  return parsePositiveInteger(process.env.LLM_CRITIC_FALLBACK_CONTEXT_CHARS, 48_000);
}

function getFallbackOutputLimit(primaryLimit: number | undefined): number | undefined {
  const fallbackLimit = parsePositiveInteger(process.env.LLM_MAX_OUTPUT_TOKENS_CRITIC_FALLBACK, 3_500);

  return primaryLimit === undefined ? fallbackLimit : Math.min(primaryLimit, fallbackLimit);
}

function parsePositiveInteger(value: string | undefined, fallback: number): number {
  const parsed = Number.parseInt(value ?? "", 10);

  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function createCriticPrompt(
  documents: JobApplicationDocuments,
  analystResult: AnalystResult,
  producerOutput: string,
  producerVersion: number,
  contextLimit?: number
): string {
  const prompt = `
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

  if (contextLimit === undefined || prompt.length <= contextLimit) {
    return prompt;
  }

  return `${prompt.slice(0, contextLimit)}\n\n[Technical fallback context limit reached.]`;
}
