import type { AnalysisRunPersistence } from "../app/ports/analysisRunPersistence.js";
import {
  cleanupOldRuns,
  initializeRunResult,
  saveRunFinal,
  saveRunMeta,
  saveRunStepOutput
} from "./saveRunResult.js";

export const fileAnalysisRunPersistence: AnalysisRunPersistence = {
  async initializeRun({ runId, resumeText, vacancyText }) {
    await initializeRunResult(runId, resumeText, vacancyText);
  },

  async saveStepOutput(runId, step) {
    await saveRunStepOutput(runId, step);
  },

  async saveFinal(runId, finalMarkdown) {
    await saveRunFinal(runId, finalMarkdown);
  },

  async saveMeta(runId, meta, steps) {
    await saveRunMeta(runId, meta, steps);
  },

  async cleanupOldRuns() {
    await cleanupOldRuns();
  }
};
