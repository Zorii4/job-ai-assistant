import { callLLMJson } from "../llm/llmClient.js";
import { criticSystemPrompt } from "../prompts/critic.prompt.js";
import type { AnalystResult } from "../contracts/analyst.contract.js";
import { criticResultSchema, type CriticResult } from "../contracts/critic.contract.js";
import type { AgentExecutionOptions, AgentExecutionResult, JobApplicationDocuments } from "../types/jobApplication.js";

export async function criticAgent(
  documents: JobApplicationDocuments,
  analystResult: AnalystResult,
  producerOutput: string,
  producerVersion: number,
  options: AgentExecutionOptions
): Promise<AgentExecutionResult<CriticResult>> {
  const userPrompt = `
Producer version:
producer.v${producerVersion}

Resume:
${documents.resumeText}

Vacancy:
${documents.vacancyText}

analystAgent output:
${JSON.stringify(analystResult, null, 2)}

producerAgent output:
${producerOutput}
`.trim();
  const response = await callLLMJson(
    criticSystemPrompt,
    userPrompt,
    criticResultSchema,
    "CriticResult",
    {
      maxOutputTokens: options.maxOutputTokens,
      timeoutMs: options.timeoutMs
    }
  );
  const outputText = JSON.stringify(response.data, null, 2);

  return {
    output: response.data,
    outputText,
    inputChars: criticSystemPrompt.length + userPrompt.length,
    outputChars: response.raw.length
  };
}
