import { callLLM } from "../llm/llmClient.js";
import { orchestratorSystemPrompt } from "../prompts/orchestrator.prompt.js";
import type { CriticDecision } from "../types/jobApplication.js";

type InitialOrchestratorInput = {
  mode: "initial";
  resumeText: string;
  vacancyText: string;
};

type FinalOrchestratorInput = {
  mode: "final";
  resumeText: string;
  vacancyText: string;
  initialOutput: string;
  analystOutput: string;
  latestProducerOutput: string;
  latestCriticOutput: string;
  revisionHistory: string;
  finalDecision: CriticDecision;
  producerVersionsUsed: number;
  maxProducerVersions: number;
  unresolvedCriticRemarks?: string;
};

export type OrchestratorAgentInput = InitialOrchestratorInput | FinalOrchestratorInput;

export async function orchestratorAgent(input: OrchestratorAgentInput): Promise<string> {
  const userPrompt = input.mode === "initial" ? createInitialPrompt(input) : createFinalPrompt(input);

  return callLLM(orchestratorSystemPrompt, userPrompt);
}

function createInitialPrompt(input: InitialOrchestratorInput): string {
  return `
Mode: initial

Resume:
${input.resumeText}

Vacancy:
${input.vacancyText}
`.trim();
}

function createFinalPrompt(input: FinalOrchestratorInput): string {
  return `
Mode: final

Resume:
${input.resumeText}

Vacancy:
${input.vacancyText}

orchestrator.initial output:
${input.initialOutput}

analyst output:
${input.analystOutput}

Latest producer output:
${input.latestProducerOutput}

Latest critic output:
${input.latestCriticOutput}

Revision history:
${input.revisionHistory}

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
${input.unresolvedCriticRemarks ?? "No unresolved critic remarks."}
`.trim();
}
