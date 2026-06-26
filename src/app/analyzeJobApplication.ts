import { randomUUID } from "node:crypto";
import { orchestratorAgent } from "../agents/orchestrator.agent.js";
import { analystAgent } from "../agents/analyst.agent.js";
import { producerAgent } from "../agents/producer.agent.js";
import { criticAgent } from "../agents/critic.agent.js";
import { parseCriticDecision } from "./parseCriticDecision.js";
import type {
  AnalyzeJobApplicationInput,
  AnalyzeJobApplicationResult,
  CriticDecision,
  JobApplicationAgentName,
  JobApplicationStep
} from "../types/jobApplication.js";

const maxRevisionCycles = 3;

export async function analyzeJobApplication(
  input: AnalyzeJobApplicationInput
): Promise<AnalyzeJobApplicationResult> {
  const runId = createRunId();
  const createdAt = new Date().toISOString();
  const steps: JobApplicationStep[] = [];
  const initialOrchestratorOutput = await runStep("orchestrator.initial", steps, () =>
    orchestratorAgent({
      mode: "initial",
      resumeText: input.resumeText,
      vacancyText: input.vacancyText
    })
  );
  const documents = {
    resumeText: input.resumeText,
    vacancyText: input.vacancyText,
    initialOrchestratorOutput
  };

  const analystOutput = await runStep("analyst", steps, () => analystAgent(documents));

  let latestProducerOutput = "";
  let latestCriticOutput = "";
  let finalDecision: CriticDecision = "UNKNOWN";
  let revisionCyclesUsed = 0;
  let warning: string | undefined;

  for (let cycle = 1; cycle <= maxRevisionCycles; cycle += 1) {
    const producerStepName = `producer.v${cycle}` as JobApplicationAgentName;
    const criticStepName = `critic.v${cycle}` as JobApplicationAgentName;
    const producerLogMessage =
      cycle > 1 ? `[app] revision required, starting producer v${cycle}` : undefined;

    if (cycle > 1) {
      revisionCyclesUsed += 1;
    }

    latestProducerOutput = await runStep(
      producerStepName,
      steps,
      () =>
        producerAgent(
          documents,
          analystOutput,
          latestProducerOutput || undefined,
          latestCriticOutput || undefined
        ),
      producerLogMessage
    );

    latestCriticOutput = await runStep(criticStepName, steps, () =>
      criticAgent(documents, analystOutput, latestProducerOutput)
    );

    finalDecision = parseCriticDecision(latestCriticOutput);

    if (finalDecision === "APPROVED") {
      break;
    }

    if (finalDecision === "UNKNOWN" && cycle === maxRevisionCycles) {
      warning = "Critic decision was not recognized after the maximum revision cycles.";
      break;
    }

    if (!shouldRevise(finalDecision, cycle)) {
      break;
    }
  }

  const finalMarkdown = await runStep("orchestrator.final", steps, () =>
    orchestratorAgent({
      mode: "final",
      resumeText: input.resumeText,
      vacancyText: input.vacancyText,
      initialOutput: initialOrchestratorOutput,
      analystOutput,
      latestProducerOutput,
      latestCriticOutput,
      revisionHistory: formatRevisionHistory(steps)
    })
  );
  const finishedAt = new Date().toISOString();

  return {
    finalMarkdown,
    steps,
    meta: {
      runId,
      source: input.source,
      userId: input.userId,
      model: process.env.LLM_MODEL,
      createdAt,
      startedAt: createdAt,
      finishedAt,
      llmMock: process.env.LLM_MOCK?.toLowerCase() === "true",
      revisionCyclesUsed,
      finalDecision,
      input: input.inputMeta,
      warning
    }
  };
}

async function runStep(
  agentName: JobApplicationAgentName,
  steps: JobApplicationStep[],
  execute: () => Promise<string>,
  logMessage?: string
): Promise<string> {
  console.log(logMessage ?? `[app] starting ${agentName.replace(".", " ")}`);
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

function shouldRevise(decision: CriticDecision, cycle: number): boolean {
  if (cycle >= maxRevisionCycles) {
    return false;
  }

  return decision === "NEEDS_REVISION" || decision === "REVISION_REQUIRED" || decision === "UNKNOWN";
}

function formatRevisionHistory(steps: JobApplicationStep[]): string {
  return steps
    .filter((step) => step.agentName.startsWith("producer.") || step.agentName.startsWith("critic."))
    .map((step) => `## ${step.agentName}\n\n${step.output}`)
    .join("\n\n");
}
