import type {
  AnalyzeJobApplicationMeta,
  JobApplicationStep
} from "../../types/jobApplication.js";

export type AnalysisRunInitialization = {
  runId: string;
  resumeText: string;
  vacancyText: string;
};

export interface AnalysisRunPersistence {
  initializeRun(input: AnalysisRunInitialization): Promise<void>;
  saveStepOutput(runId: string, step: JobApplicationStep): Promise<void>;
  saveFinal(runId: string, finalMarkdown: string): Promise<void>;
  saveMeta(
    runId: string,
    meta: AnalyzeJobApplicationMeta,
    steps: JobApplicationStep[]
  ): Promise<void>;
  cleanupOldRuns(): Promise<void>;
}
