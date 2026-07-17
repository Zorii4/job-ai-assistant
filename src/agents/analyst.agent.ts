import { callLLMJson } from "../llm/llmClient.js";
import { analystSystemPrompt } from "../prompts/analyst.prompt.js";
import { analystResultSchema, type AnalystResult } from "../contracts/analyst.contract.js";
import type { AgentExecutionOptions, AgentExecutionResult, JobApplicationDocuments } from "../types/jobApplication.js";

export async function analystAgent(
  documents: JobApplicationDocuments,
  options: AgentExecutionOptions
): Promise<AgentExecutionResult<AnalystResult>> {
  const userPrompt = `
Resume:
${documents.resumeText}

Vacancy:
${documents.vacancyText}
`.trim();
  const response = await callLLMJson(
    analystSystemPrompt,
    userPrompt,
    analystResultSchema,
    "AnalystResult",
    {
      maxOutputTokens: options.maxOutputTokens,
      timeoutMs: options.timeoutMs
    }
  );
  const outputText = JSON.stringify(response.data, null, 2);

  return {
    output: response.data,
    outputText,
    inputChars: analystSystemPrompt.length + userPrompt.length,
    outputChars: response.raw.length
  };
}
