import { callLLM } from "../llm/llmClient.js";
import { orchestratorSystemPrompt } from "../prompts/orchestrator.prompt.js";
import type { AnalystResult } from "../contracts/analyst.contract.js";
import type { AgentExecutionOptions, AgentExecutionResult } from "../types/jobApplication.js";

type FinalOrchestratorInput = {
  mode: "final";
  resumeText: string;
  vacancyText: string;
  analystResult: AnalystResult;
  latestProducerOutput: string;
};

export type OrchestratorAgentInput = FinalOrchestratorInput;

export async function orchestratorAgent(
  input: OrchestratorAgentInput,
  options: AgentExecutionOptions
): Promise<AgentExecutionResult> {
  const userPrompt = createFinalPrompt(input);
  const output = await callLLM(orchestratorSystemPrompt, userPrompt, {
    maxOutputTokens: options.maxOutputTokens,
    timeoutMs: options.timeoutMs
  });

  return {
    output,
    outputText: output,
    inputChars: orchestratorSystemPrompt.length + userPrompt.length,
    outputChars: output.length
  };
}

export function createFinalPrompt(input: FinalOrchestratorInput): string {
  return `
Mode: final

Resume:
${input.resumeText}

Vacancy:
${input.vacancyText}

Analyst contract:
${JSON.stringify(input.analystResult, null, 2)}

Latest producer output:
${input.latestProducerOutput}

Finalization rule:
Create the final user-facing report only from the Analyst contract and the latest producer output. Never mention internal agents, checks, iterations, decisions, or the process that produced the materials.
`.trim();
}
