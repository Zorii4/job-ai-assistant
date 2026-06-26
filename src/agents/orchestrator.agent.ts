import { callLLM } from "../llm/llmClient.js";
import { orchestratorSystemPrompt } from "../prompts/orchestrator.prompt.js";

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
`.trim();
}
