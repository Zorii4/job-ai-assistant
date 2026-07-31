import { analystAgent } from "../agents/analyst.agent.js";
import { criticAgent } from "../agents/critic.agent.js";
import { orchestratorAgent } from "../agents/orchestrator.agent.js";
import { producerAgent } from "../agents/producer.agent.js";
import type { InitialWorkflowPromptBundle } from "./initialWorkflowPromptBundle.js";
import type { AnalystResult } from "../contracts/analyst.contract.js";
import type { CriticResult } from "../contracts/critic.contract.js";
import type {
  AgentExecutionResult,
  AnalyzeJobApplicationProgressReporter,
  AnalyzeJobApplicationProgressStage,
  CriticDecision,
  JobApplicationAgentName,
  JobApplicationDocuments,
  JobApplicationStep
} from "../types/jobApplication.js";

export type InitialAnalysisWorkflowMode = "fast" | "deep";

export type InitialAnalysisWorkflowConfig = {
  analysisMode: InitialAnalysisWorkflowMode;
  maxRevisionCycles: number;
  maxProducerVersions: number;
  stepTimeoutMs: number;
  totalTimeoutMs: number;
};

export type InitialAnalysisWorkflowState = {
  revisionCyclesUsed: number;
  finalDecision: CriticDecision;
};

export type InitialAnalysisWorkflowInput = {
  documents: JobApplicationDocuments;
  config: InitialAnalysisWorkflowConfig;
  prompts: InitialWorkflowPromptBundle;
  deadlineAt: number;
  onProgress?: AnalyzeJobApplicationProgressReporter;
  onStepStarted?: (stepName: JobApplicationAgentName) => Promise<void> | void;
  onStepCompleted?: (step: JobApplicationStep) => Promise<void> | void;
  onStateChanged?: (state: InitialAnalysisWorkflowState) => Promise<void> | void;
};

export type InitialAnalysisWorkflowResult = {
  finalMarkdown: string;
  state: InitialAnalysisWorkflowState;
};

export function getInitialAnalysisWorkflowConfig(): InitialAnalysisWorkflowConfig {
  const analysisMode = process.env.ANALYSIS_MODE === "deep" ? "deep" : "fast";
  const configuredRevisionCycles = parseNonNegativeInteger(process.env.MAX_REVISION_CYCLES, 0);
  const maxRevisionCycles = analysisMode === "fast" ? 0 : Math.min(configuredRevisionCycles, 2);

  return {
    analysisMode,
    maxRevisionCycles,
    maxProducerVersions: Math.min(maxRevisionCycles + 1, 3),
    stepTimeoutMs: parsePositiveInteger(process.env.LLM_STEP_TIMEOUT_MS, 120000),
    totalTimeoutMs: parsePositiveInteger(process.env.ANALYSIS_TOTAL_TIMEOUT_MS, 300000)
  };
}

export async function runInitialAnalysisWorkflow(
  input: InitialAnalysisWorkflowInput
): Promise<InitialAnalysisWorkflowResult> {
  const { config, deadlineAt, documents, prompts } = input;
  let latestProducerOutput = "";
  let latestCriticResult: CriticResult | undefined;
  let finalDecision: CriticDecision = "UNKNOWN";
  let revisionCyclesUsed = 0;

  const getState = (): InitialAnalysisWorkflowState => ({
    revisionCyclesUsed,
    finalDecision
  });

  const notifyStateChanged = async (): Promise<void> => {
    await input.onStateChanged?.(getState());
  };

  const beginStep = async (
    stage: AnalyzeJobApplicationProgressStage,
    stepName: JobApplicationAgentName
  ): Promise<void> => {
    await input.onStepStarted?.(stepName);
    await input.onProgress?.({ stage, stepName });
  };

  const analystStepName = "analyst";
  await beginStep("analyst", analystStepName);
  const analystResult = await runStep(
    analystStepName,
    () => analystAgent(documents, createStepOptions(analystStepName, config, deadlineAt), prompts.analyst),
    input.onStepCompleted
  );

  for (let cycle = 1; cycle <= config.maxProducerVersions; cycle += 1) {
    const producerStepName = `producer.v${cycle}` as JobApplicationAgentName;
    const criticStepName = `critic.v${cycle}` as JobApplicationAgentName;
    const producerLogMessage =
      cycle > 1 ? `[app] revision required, starting producer v${cycle}` : undefined;

    if (cycle > 1) {
      revisionCyclesUsed += 1;
      await notifyStateChanged();
    }

    await beginStep("producer", producerStepName);
    latestProducerOutput = await runStep(
      producerStepName,
      () =>
        producerAgent(
          documents,
          analystResult,
          createStepOptions(producerStepName, config, deadlineAt),
          prompts.producer,
          latestProducerOutput || undefined,
          latestCriticResult
        ),
      input.onStepCompleted,
      producerLogMessage
    );

    await beginStep("critic", criticStepName);
    latestCriticResult = await runStep(
      criticStepName,
      () =>
        criticAgent(
          documents,
          analystResult,
          latestProducerOutput,
          cycle,
          createStepOptions(criticStepName, config, deadlineAt),
          prompts.critic
        ),
      input.onStepCompleted
    );

    finalDecision = latestCriticResult.decision;
    await notifyStateChanged();

    if (finalDecision === "APPROVED") {
      break;
    }

    if (!shouldRevise(finalDecision, cycle, config.maxProducerVersions)) {
      break;
    }
  }

  if (!latestCriticResult) {
    throw new Error("Critic did not return a result.");
  }

  if (finalDecision === "NEEDS_REVISION") {
    throw new Error("Critical Critic findings remain after the allowed revision cycles.");
  }

  const finalStepName = "orchestrator.final";
  await beginStep("final", finalStepName);
  const finalMarkdown = await runStep(
    finalStepName,
    () =>
      orchestratorAgent(
        {
          mode: "final",
          resumeText: documents.resumeText,
          vacancyText: documents.vacancyText,
          analystResult,
          latestProducerOutput
        },
        createStepOptions(finalStepName, config, deadlineAt),
        prompts.orchestrator
      ),
    input.onStepCompleted
  );

  return {
    finalMarkdown,
    state: getState()
  };
}

async function runStep<TOutput>(
  agentName: JobApplicationAgentName,
  execute: () => Promise<AgentExecutionResult<TOutput>>,
  onStepCompleted: InitialAnalysisWorkflowInput["onStepCompleted"],
  logMessage?: string
): Promise<TOutput> {
  console.log(logMessage ?? `[app] starting ${agentName.replace(".", " ")}`);
  const startedAt = new Date().toISOString();
  const startedAtMs = Date.now();
  const result = await execute();
  const finishedAt = new Date().toISOString();
  const durationMs = Date.now() - startedAtMs;
  const step: JobApplicationStep = {
    agentName,
    output: result.outputText,
    startedAt,
    finishedAt,
    durationMs,
    inputChars: result.inputChars,
    outputChars: result.outputChars,
    attemptCount: result.attemptCount,
    retryErrorCodes: result.retryErrorCodes
  };

  console.log(
    `[app] finished ${agentName} in ${durationMs}ms, attempts=${step.attemptCount}, inputChars=${step.inputChars}, outputChars=${step.outputChars}`
  );
  await onStepCompleted?.(step);

  return result.output;
}

function shouldRevise(decision: CriticDecision, cycle: number, maxProducerVersions: number): boolean {
  if (cycle >= maxProducerVersions) {
    return false;
  }

  return decision === "NEEDS_REVISION" || decision === "UNKNOWN";
}

function createStepOptions(
  stepName: JobApplicationAgentName,
  config: InitialAnalysisWorkflowConfig,
  deadlineAt: number
): { maxOutputTokens: number; timeoutMs: number } {
  const remainingMs = deadlineAt - Date.now();

  if (remainingMs <= 0) {
    throw new Error(`Analysis total timeout exceeded after ${config.totalTimeoutMs}ms.`);
  }

  return {
    maxOutputTokens: getMaxOutputTokens(stepName),
    timeoutMs: Math.min(config.stepTimeoutMs, remainingMs)
  };
}

function getMaxOutputTokens(stepName: JobApplicationAgentName): number {
  if (stepName === "analyst") {
    return parsePositiveInteger(process.env.LLM_MAX_OUTPUT_TOKENS_ANALYST, 3500);
  }

  if (stepName.startsWith("producer.")) {
    return parsePositiveInteger(process.env.LLM_MAX_OUTPUT_TOKENS_PRODUCER, 4500);
  }

  if (stepName.startsWith("critic.")) {
    return parsePositiveInteger(process.env.LLM_MAX_OUTPUT_TOKENS_CRITIC, 2200);
  }

  return parsePositiveInteger(process.env.LLM_MAX_OUTPUT_TOKENS_ORCHESTRATOR_FINAL, 4500);
}

function parsePositiveInteger(value: string | undefined, fallback: number): number {
  if (!value) {
    return fallback;
  }

  const parsed = Number.parseInt(value, 10);

  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function parseNonNegativeInteger(value: string | undefined, fallback: number): number {
  if (!value) {
    return fallback;
  }

  const parsed = Number.parseInt(value, 10);

  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}
