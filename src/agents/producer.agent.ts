import { callLLM } from "../llm/llmClient.js";
import { producerSystemPrompt } from "../prompts/producer.prompt.js";
import type { AgentExecutionOptions, AgentExecutionResult, JobApplicationDocuments } from "../types/jobApplication.js";

export async function producerAgent(
  documents: JobApplicationDocuments,
  analystOutput: string,
  options: AgentExecutionOptions,
  previousProducerOutput?: string,
  criticFeedback?: string
): Promise<AgentExecutionResult> {
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
  const output = await callLLM(producerSystemPrompt, userPrompt, {
    maxOutputTokens: options.maxOutputTokens,
    timeoutMs: options.timeoutMs
  });

  return {
    output,
    inputChars: producerSystemPrompt.length + userPrompt.length,
    outputChars: output.length
  };
}
