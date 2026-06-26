import { callLLM } from "../llm/llmClient.js";
import { producerSystemPrompt } from "../prompts/producer.prompt.js";
import type { JobApplicationDocuments } from "../types/jobApplication.js";

export async function producerAgent(
  documents: JobApplicationDocuments,
  analystOutput: string,
  previousProducerOutput?: string,
  criticFeedback?: string
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

Previous producerAgent output:
${previousProducerOutput ?? "No previous producer output."}

criticAgent feedback:
${criticFeedback ?? "No critic feedback yet."}
`.trim();

  return callLLM(producerSystemPrompt, userPrompt);
}
