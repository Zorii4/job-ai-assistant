import { callLLM } from "../llm/llmClient.js";
import { createLlmAttemptMetrics } from "../llm/retryTransientRequest.js";
import type { AnalystResult } from "../contracts/analyst.contract.js";
import type { AgentExecutionOptions, AgentExecutionResult } from "../types/jobApplication.js";

export type OrchestratorContextMode = "full" | "limited";

type FinalOrchestratorInputBase = {
  mode: "final";
  analystResult: AnalystResult;
  latestProducerOutput: string;
};

type FinalOrchestratorInput =
  | (FinalOrchestratorInputBase & {
      contextMode?: "full";
      resumeText: string;
      vacancyText: string;
    })
  | (FinalOrchestratorInputBase & {
      contextMode: "limited";
    });

export type OrchestratorAgentInput = FinalOrchestratorInput;

export async function orchestratorAgent(
  input: OrchestratorAgentInput,
  options: AgentExecutionOptions,
  systemPrompt: string
): Promise<AgentExecutionResult> {
  const userPrompt = createFinalPrompt(input);
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

export function createFinalPrompt(input: FinalOrchestratorInput): string {
  const sourceDocuments =
    input.contextMode === "limited"
      ? "Source resume and vacancy are deliberately omitted. Do not infer or restore facts that are absent from the supplied contracts."
      : `Resume:
${input.resumeText}

Vacancy:
${input.vacancyText}`;

  return `
Mode: final

${sourceDocuments}

Analyst contract:
${JSON.stringify(input.analystResult, null, 2)}

Latest producer output:
${input.latestProducerOutput}

Finalization rule:
Create the final user-facing report only from the Analyst contract and the latest producer output. Never mention internal agents, checks, iterations, decisions, or the process that produced the materials.
`.trim();
}
