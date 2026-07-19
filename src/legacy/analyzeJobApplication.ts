import { randomUUID } from "node:crypto";
import { createAnalyzeJobApplication } from "../app/analyzeJobApplication.js";
import { fileAnalysisRunPersistence } from "../files/fileAnalysisRunPersistence.js";

export const analyzeJobApplication = createAnalyzeJobApplication({
  persistence: fileAnalysisRunPersistence,
  createRunId: createRandomRunId
});

function createRandomRunId(): string {
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  return `${timestamp}-${randomUUID()}`;
}
