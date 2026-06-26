import { callLLM } from "../llm/llmClient.js";
import { criticSystemPrompt } from "../prompts/critic.prompt.js";
import type { JobApplicationDocuments } from "../types/jobApplication.js";

export async function criticAgent(
  documents: JobApplicationDocuments,
  analystOutput: string,
  producerOutput: string
): Promise<string> {
  const userPrompt = `
Resume:
${documents.resumeText}

Vacancy:
${documents.vacancyText}

orchestrator.initial output:
${documents.initialOrchestratorOutput}

analystAgent output:
${analystOutput}

producerAgent output:
${producerOutput}
`.trim();

  return callLLM(criticSystemPrompt, userPrompt);
}
