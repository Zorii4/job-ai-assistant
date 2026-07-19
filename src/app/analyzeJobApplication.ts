import { randomUUID } from "node:crypto";
import { orchestratorAgent } from "../agents/orchestrator.agent.js";
import { classifyLlmError } from "../llm/retryTransientRequest.js";
import { analystAgent } from "../agents/analyst.agent.js";
import { producerAgent } from "../agents/producer.agent.js";
import { criticAgent } from "../agents/critic.agent.js";
import type { CriticResult } from "../contracts/critic.contract.js";
import {
  cleanupOldRuns,
  initializeRunResult,
  saveRunFinal,
  saveRunMeta,
  saveRunStepOutput
} from "../files/saveRunResult.js";
import type {
  AgentExecutionResult,
  AnalyzeJobApplicationInput,
  AnalyzeJobApplicationMeta,
  AnalyzeJobApplicationProgressStage,
  AnalyzeJobApplicationResult,
  CriticDecision,
  JobApplicationAgentName,
  JobApplicationStep
} from "../types/jobApplication.js";

type AnalysisMode = "fast" | "deep";

type AnalysisConfig = {
  analysisMode: AnalysisMode;
  maxRevisionCycles: number;
  maxProducerVersions: number;
  stepTimeoutMs: number;
  totalTimeoutMs: number;
};

export async function analyzeJobApplication(
  input: AnalyzeJobApplicationInput
): Promise<AnalyzeJobApplicationResult> {
  const runId = createRunId();
  const config = getAnalysisConfig();
  const createdAt = new Date().toISOString();
  const steps: JobApplicationStep[] = [];
  const deadlineAt = Date.now() + config.totalTimeoutMs;
  let latestProducerOutput = "";
  let latestCriticResult: CriticResult | undefined;
  let finalDecision: CriticDecision = "UNKNOWN";
  let revisionCyclesUsed = 0;
  let currentStepName: JobApplicationAgentName | undefined;

  const createMeta = (finishedAt: string): AnalyzeJobApplicationMeta => ({
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
      analysisMode: config.analysisMode,
      maxRevisionCycles: config.maxRevisionCycles
  });

  await initializeRunResult(runId, input.resumeText, input.vacancyText);
  await saveRunMeta(runId, createMeta(createdAt), steps);

  try {
    const documents = {
      resumeText: input.resumeText,
      vacancyText: input.vacancyText
    };

    const analystStepName = "analyst";
    currentStepName = analystStepName;
    await notifyProgress(input, "analyst", analystStepName);
    const analystResult = await runStep(
      analystStepName,
      steps,
      () => analystAgent(documents, createStepOptions(analystStepName, config, deadlineAt)),
      runId,
      createMeta
    );

    for (let cycle = 1; cycle <= config.maxProducerVersions; cycle += 1) {
      const producerStepName = `producer.v${cycle}` as JobApplicationAgentName;
      const criticStepName = `critic.v${cycle}` as JobApplicationAgentName;
      const producerLogMessage =
        cycle > 1 ? `[app] revision required, starting producer v${cycle}` : undefined;

      if (cycle > 1) {
        revisionCyclesUsed += 1;
      }

      currentStepName = producerStepName;
      await notifyProgress(input, "producer", currentStepName);
      latestProducerOutput = await runStep(
        producerStepName,
        steps,
        () =>
          producerAgent(
            documents,
            analystResult,
            createStepOptions(producerStepName, config, deadlineAt),
            latestProducerOutput || undefined,
            latestCriticResult
          ),
        runId,
        createMeta,
        producerLogMessage
      );

      currentStepName = criticStepName;
      await notifyProgress(input, "critic", currentStepName);
      latestCriticResult = await runStep(
        criticStepName,
        steps,
        () =>
          criticAgent(
            documents,
            analystResult,
            latestProducerOutput,
            cycle,
            createStepOptions(criticStepName, config, deadlineAt)
          ),
        runId,
        createMeta
      );

      finalDecision = latestCriticResult.decision;

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
    currentStepName = finalStepName;
    await notifyProgress(input, "final", finalStepName);
    const finalMarkdown = await runStep(
      finalStepName,
      steps,
      () =>
        orchestratorAgent(
          {
            mode: "final",
            resumeText: input.resumeText,
            vacancyText: input.vacancyText,
            analystResult,
            latestProducerOutput
          },
          createStepOptions(finalStepName, config, deadlineAt)
        ),
      runId,
      createMeta
    );
    const finishedAt = new Date().toISOString();
    const result = {
      finalMarkdown,
      steps,
      meta: createMeta(finishedAt)
    };

    await saveRunFinal(runId, finalMarkdown);
    await saveRunMeta(runId, result.meta, steps);
    await cleanupOldRuns();

    return result;
  } catch (error) {
    const errorCode = classifyLlmError(error);
    const finishedAt = new Date().toISOString();
    const errorMeta = {
      ...createMeta(finishedAt),
      error: {
        code: errorCode,
        message: errorCode,
        stepName: currentStepName,
        occurredAt: finishedAt
      }
    };

    console.error(`[app] failed ${currentStepName ?? "analysis"}: ${errorCode}`);
    await saveRunMeta(runId, errorMeta, steps);

    throw error;
  }
}

async function runStep<TOutput>(
  agentName: JobApplicationAgentName,
  steps: JobApplicationStep[],
  execute: () => Promise<AgentExecutionResult<TOutput>>,
  runId: string,
  createMeta: (finishedAt: string) => AnalyzeJobApplicationMeta,
  logMessage?: string
): Promise<TOutput> {
  console.log(logMessage ?? `[app] starting ${agentName.replace(".", " ")}`);
  const startedAt = new Date().toISOString();
  const startedAtMs = Date.now();
  const result = await execute();
  const finishedAt = new Date().toISOString();
  const durationMs = Date.now() - startedAtMs;

  const step = {
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

  steps.push(step);
  console.log(
    `[app] finished ${agentName} in ${durationMs}ms, attempts=${step.attemptCount}, inputChars=${step.inputChars}, outputChars=${step.outputChars}`
  );
  await saveRunStepOutput(runId, step);
  await saveRunMeta(runId, createMeta(finishedAt), steps);

  return result.output;
}

function createRunId(): string {
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  return `${timestamp}-${randomUUID()}`;
}

function shouldRevise(decision: CriticDecision, cycle: number, maxProducerVersions: number): boolean {
  if (cycle >= maxProducerVersions) {
    return false;
  }

  return decision === "NEEDS_REVISION" || decision === "UNKNOWN";
}

function getAnalysisConfig(): AnalysisConfig {
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

function createStepOptions(
  stepName: JobApplicationAgentName,
  config: AnalysisConfig,
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

async function notifyProgress(
  input: AnalyzeJobApplicationInput,
  stage: AnalyzeJobApplicationProgressStage,
  stepName: JobApplicationAgentName
): Promise<void> {
  await input.onProgress?.({
    stage,
    stepName
  });
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
