import {
  getInitialAnalysisWorkflowConfig,
  runInitialAnalysisWorkflow,
  type InitialAnalysisWorkflowState
} from "../ai/runInitialAnalysisWorkflow.js";
import { loadInitialWorkflowPromptBundle } from "../ai/initialWorkflowPromptBundle.js";
import { classifyLlmError } from "../llm/retryTransientRequest.js";
import type {
  AnalyzeJobApplicationInput,
  AnalyzeJobApplicationMeta,
  AnalyzeJobApplicationResult,
  JobApplicationAgentName,
  JobApplicationStep
} from "../types/jobApplication.js";
import type { AnalysisRunPersistence } from "./ports/analysisRunPersistence.js";

export type AnalyzeJobApplicationDependencies = {
  persistence: AnalysisRunPersistence;
  createRunId: () => string;
};

export type AnalyzeJobApplicationUseCase = (
  input: AnalyzeJobApplicationInput
) => Promise<AnalyzeJobApplicationResult>;

export function createAnalyzeJobApplication(
  dependencies: AnalyzeJobApplicationDependencies
): AnalyzeJobApplicationUseCase {
  return async (input) => runAnalyzeJobApplication(input, dependencies);
}

async function runAnalyzeJobApplication(
  input: AnalyzeJobApplicationInput,
  dependencies: AnalyzeJobApplicationDependencies
): Promise<AnalyzeJobApplicationResult> {
  const { persistence } = dependencies;
  const runId = dependencies.createRunId();
  const config = getInitialAnalysisWorkflowConfig();
  const createdAt = new Date().toISOString();
  const deadlineAt = Date.now() + config.totalTimeoutMs;
  const steps: JobApplicationStep[] = [];
  let workflowState: InitialAnalysisWorkflowState = {
    revisionCyclesUsed: 0,
    finalDecision: "UNKNOWN"
  };
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
    revisionCyclesUsed: workflowState.revisionCyclesUsed,
    finalDecision: workflowState.finalDecision,
    input: input.inputMeta,
    analysisMode: config.analysisMode,
    maxRevisionCycles: config.maxRevisionCycles
  });

  await persistence.initializeRun({
    runId,
    resumeText: input.resumeText,
    vacancyText: input.vacancyText
  });
  await persistence.saveMeta(runId, createMeta(createdAt), steps);

  try {
    const prompts = await loadInitialWorkflowPromptBundle();
    const workflowResult = await runInitialAnalysisWorkflow({
      documents: {
        resumeText: input.resumeText,
        vacancyText: input.vacancyText
      },
      config,
      prompts,
      deadlineAt,
      onProgress: input.onProgress,
      onStepStarted: (stepName) => {
        currentStepName = stepName;
      },
      onStepCompleted: async (step) => {
        steps.push(step);
        await persistence.saveStepOutput(runId, step);
        await persistence.saveMeta(runId, createMeta(step.finishedAt), steps);
      },
      onStateChanged: (state) => {
        workflowState = state;
      }
    });
    workflowState = workflowResult.state;

    const finishedAt = new Date().toISOString();
    const result = {
      finalMarkdown: workflowResult.finalMarkdown,
      steps,
      meta: createMeta(finishedAt)
    };

    await persistence.saveFinal(runId, result.finalMarkdown);
    await persistence.saveMeta(runId, result.meta, steps);
    await persistence.cleanupOldRuns();

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
    await persistence.saveMeta(runId, errorMeta, steps);

    throw error;
  }
}
