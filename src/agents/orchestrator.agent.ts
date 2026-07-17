import { callLLM } from "../llm/llmClient.js";
import { orchestratorSystemPrompt } from "../prompts/orchestrator.prompt.js";
import type { AnalystResult } from "../contracts/analyst.contract.js";
import type { CriticResult } from "../contracts/critic.contract.js";
import type { AgentExecutionOptions, AgentExecutionResult, CriticDecision } from "../types/jobApplication.js";

type FinalOrchestratorInput = {
  mode: "final";
  resumeText: string;
  vacancyText: string;
  analystResult: AnalystResult;
  latestProducerOutput: string;
  latestCriticResult: CriticResult;
  criticHistory: Array<{
    producerVersion: number;
    result: CriticResult;
  }>;
  finalDecision: CriticDecision;
  producerVersionsUsed: number;
  maxProducerVersions: number;
  unresolvedCriticRemarks?: CriticResult;
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

function createFinalPrompt(input: FinalOrchestratorInput): string {
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

Latest critic contract:
${JSON.stringify(input.latestCriticResult, null, 2)}

Critic revision history:
${JSON.stringify(input.criticHistory, null, 2)}

Process status:
- finalDecision: ${input.finalDecision}
- producerVersionsUsed: ${input.producerVersionsUsed}
- maxProducerVersions: ${input.maxProducerVersions}

Finalization rule:
${
  input.finalDecision === "APPROVED"
    ? "Critic approved the latest producer output. Create the final user-facing report from the approved materials."
    : "Critic did not approve the latest producer output within the limit of 3 producer versions. Create the best possible final user-facing report from the latest producer output, and explicitly state that some critic remarks remain unresolved. Do not expose raw DECISION markers."
}

Unresolved critic remarks:
${
  input.unresolvedCriticRemarks
    ? JSON.stringify(input.unresolvedCriticRemarks, null, 2)
    : "No unresolved critic remarks."
}
`.trim();
}
