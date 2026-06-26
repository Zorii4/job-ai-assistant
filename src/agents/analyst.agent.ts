import { callLLM } from "../llm/llmClient.js";
import { analystSystemPrompt } from "../prompts/analyst.prompt.js";
import type { JobApplicationDocuments } from "../types/jobApplication.js";

export async function analystAgent(documents: JobApplicationDocuments): Promise<string> {
  const userPrompt = `
Resume:
${documents.resumeText}

Vacancy:
${documents.vacancyText}

orchestrator.initial output:
${documents.initialOrchestratorOutput}
`.trim();

  return callLLM(analystSystemPrompt, userPrompt);
}
