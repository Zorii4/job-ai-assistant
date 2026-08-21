ALTER TYPE "AnalysisWorkflowType" ADD VALUE IF NOT EXISTS 'POST_INTERVIEW';
ALTER TYPE "ArtifactType" ADD VALUE IF NOT EXISTS 'POST_INTERVIEW_REVIEW';
ALTER TYPE "ArtifactType" ADD VALUE IF NOT EXISTS 'HR_CLOSING_MESSAGE';

CREATE TABLE "post_interview_input" (
  "applicationCaseId" TEXT NOT NULL,
  "sanitizedHrMessage" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "post_interview_input_pkey" PRIMARY KEY ("applicationCaseId"),
  CONSTRAINT "post_interview_input_applicationCaseId_fkey"
    FOREIGN KEY ("applicationCaseId") REFERENCES "application_case"("id")
    ON DELETE CASCADE ON UPDATE CASCADE
);

ALTER TABLE "analysis_run" ADD COLUMN "manualRetryCount" INTEGER NOT NULL DEFAULT 0;
