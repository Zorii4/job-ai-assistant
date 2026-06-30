import { callLLM } from "../llm/llmClient.js";
import { analystSystemPrompt } from "../prompts/analyst.prompt.js";
import type { AgentExecutionOptions, AgentExecutionResult, JobApplicationDocuments } from "../types/jobApplication.js";

export async function analystAgent(
  documents: JobApplicationDocuments,
  options: AgentExecutionOptions
): Promise<AgentExecutionResult> {
  const userPrompt = `
Resume:
${documents.resumeText}

Vacancy:
${documents.vacancyText}

orchestrator.initial output:
${documents.initialOrchestratorOutput}
`.trim();
  const output = await callLLM(analystSystemPrompt, userPrompt, {
    maxOutputTokens: options.maxOutputTokens,
    timeoutMs: options.timeoutMs
  });

  return createAgentExecutionResult(analystSystemPrompt, userPrompt, output);
}

function createAgentExecutionResult(
  systemPrompt: string,
  userPrompt: string,
  output: string
): AgentExecutionResult {
  return {
    output,
    inputChars: systemPrompt.length + userPrompt.length,
    outputChars: output.length
  };
}
