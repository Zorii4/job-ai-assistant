import { randomUUID } from "node:crypto";
import { analystAgent } from "../agents/analyst.agent.js";
import { producerAgent } from "../agents/producer.agent.js";
import { criticAgent } from "../agents/critic.agent.js";
import type {
  AnalyzeJobApplicationInput,
  AnalyzeJobApplicationResult,
  JobApplicationAgentName,
  JobApplicationStep
} from "../types/jobApplication.js";

export async function analyzeJobApplication(
  input: AnalyzeJobApplicationInput
): Promise<AnalyzeJobApplicationResult> {
  const runId = createRunId();
  const startedAt = new Date().toISOString();
  const steps: JobApplicationStep[] = [];
  const documents = {
    resumeText: input.resumeText,
    vacancyText: input.vacancyText
  };

  const analystOutput = await runStep("analyst", steps, () => analystAgent(documents));
  const producerOutput = await runStep("producer", steps, () => producerAgent(documents, analystOutput));
  const criticOutput = await runStep("critic", steps, () => criticAgent(documents, analystOutput, producerOutput));
  const finishedAt = new Date().toISOString();

  return {
    finalMarkdown: criticOutput,
    steps,
    meta: {
      runId,
      source: input.source,
      userId: input.userId,
      startedAt,
      finishedAt,
      llmMock: process.env.LLM_MOCK?.toLowerCase() === "true"
    }
  };
}

async function runStep(
  agentName: JobApplicationAgentName,
  steps: JobApplicationStep[],
  execute: () => Promise<string>
): Promise<string> {
  console.log(`[app] starting ${agentName}`);
  const startedAt = new Date().toISOString();
  const output = await execute();
  const finishedAt = new Date().toISOString();

  steps.push({
    agentName,
    output,
    startedAt,
    finishedAt
  });

  return output;
}

function createRunId(): string {
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  return `${timestamp}-${randomUUID()}`;
}
