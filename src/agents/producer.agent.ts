import { callLLM } from "../llm/llmClient.js";
import { producerSystemPrompt } from "../prompts/producer.prompt.js";
import type { AnalystResult } from "../contracts/analyst.contract.js";
import type { CriticResult } from "../contracts/critic.contract.js";
import type { AgentExecutionOptions, AgentExecutionResult, JobApplicationDocuments } from "../types/jobApplication.js";

export async function producerAgent(
  documents: JobApplicationDocuments,
  analystResult: AnalystResult,
  options: AgentExecutionOptions,
  previousProducerOutput?: string,
  criticFeedback?: CriticResult
): Promise<AgentExecutionResult> {
  const userPrompt = `
Resume:
${documents.resumeText}

Vacancy:
${documents.vacancyText}

analystAgent output:
${JSON.stringify(analystResult, null, 2)}

Previous producerAgent output:
${previousProducerOutput ?? "No previous producer output."}

criticAgent feedback:
${criticFeedback ? JSON.stringify(criticFeedback, null, 2) : "No critic feedback yet."}
`.trim();
  const output = await callLLM(producerSystemPrompt, userPrompt, {
    maxOutputTokens: options.maxOutputTokens,
    timeoutMs: options.timeoutMs
  });

  return {
    output,
    outputText: output,
    inputChars: producerSystemPrompt.length + userPrompt.length,
    outputChars: output.length
  };
}
