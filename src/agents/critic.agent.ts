import { callLLM } from "../llm/llmClient.js";
import { criticSystemPrompt } from "../prompts/critic.prompt.js";
import type { AgentExecutionOptions, AgentExecutionResult, JobApplicationDocuments } from "../types/jobApplication.js";

export async function criticAgent(
  documents: JobApplicationDocuments,
  analystOutput: string,
  producerOutput: string,
  producerVersion: number,
  options: AgentExecutionOptions
): Promise<AgentExecutionResult> {
  const userPrompt = `
Producer version:
producer.v${producerVersion}

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
  const output = await callLLM(criticSystemPrompt, userPrompt, {
    maxOutputTokens: options.maxOutputTokens,
    timeoutMs: options.timeoutMs
  });

  return {
    output,
    inputChars: criticSystemPrompt.length + userPrompt.length,
    outputChars: output.length
  };
}
