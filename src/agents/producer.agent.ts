import { callLLM } from "../llm/llmClient.js";
import { producerSystemPrompt } from "../prompts/producer.prompt.js";
import type { JobApplicationDocuments } from "../types/jobApplication.js";

export async function producerAgent(
  documents: JobApplicationDocuments,
  analystOutput: string
): Promise<string> {
  const userPrompt = `
Resume:
${documents.resumeText}

Vacancy:
${documents.vacancyText}

analystAgent output:
${analystOutput}
`.trim();

  return callLLM(producerSystemPrompt, userPrompt);
}
