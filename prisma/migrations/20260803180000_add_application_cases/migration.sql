-- CreateEnum
CREATE TYPE "VacancySourceType" AS ENUM ('TEXT', 'FILE');

-- CreateEnum
CREATE TYPE "ApplicationCaseStatus" AS ENUM ('DRAFT', 'ANALYZING', 'ANALYSIS_READY', 'FAILED');

-- CreateEnum
CREATE TYPE "AnalysisWorkflowType" AS ENUM ('INITIAL_ANALYSIS');

-- CreateEnum
CREATE TYPE "AnalysisRunStatus" AS ENUM ('QUEUED', 'RUNNING', 'SUCCEEDED', 'FAILED');

-- CreateTable
CREATE TABLE "application_case" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "resumeId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "vacancySourceType" "VacancySourceType" NOT NULL,
    "vacancySourceFileName" TEXT,
    "vacancySourceText" TEXT NOT NULL,
    "vacancySanitizedText" TEXT NOT NULL,
    "resumeSanitizedText" TEXT NOT NULL,
    "status" "ApplicationCaseStatus" NOT NULL DEFAULT 'DRAFT',
    "currentStage" TEXT NOT NULL DEFAULT 'DRAFT',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "application_case_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "application_case_userId_updatedAt_idx" ON "application_case"("userId", "updatedAt");

-- CreateIndex
CREATE INDEX "application_case_resumeId_idx" ON "application_case"("resumeId");

-- CreateTable
CREATE TABLE "analysis_run" (
    "id" TEXT NOT NULL,
    "applicationCaseId" TEXT NOT NULL,
    "workflowType" "AnalysisWorkflowType" NOT NULL,
    "status" "AnalysisRunStatus" NOT NULL DEFAULT 'QUEUED',
    "currentStage" TEXT,
    "model" TEXT,
    "promptVersion" TEXT,
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    "errorCode" TEXT,
    "errorMessageSanitized" TEXT,
    "queueJobId" TEXT,
    "finalMarkdown" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "analysis_run_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "analysis_run_applicationCaseId_createdAt_idx" ON "analysis_run"("applicationCaseId", "createdAt");

-- CreateIndex
CREATE INDEX "analysis_run_status_createdAt_idx" ON "analysis_run"("status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "analysis_run_queueJobId_key" ON "analysis_run"("queueJobId");

-- CreateIndex
CREATE UNIQUE INDEX "analysis_run_applicationCaseId_workflowType_key" ON "analysis_run"("applicationCaseId", "workflowType");

-- AddForeignKey
ALTER TABLE "application_case" ADD CONSTRAINT "application_case_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "application_case" ADD CONSTRAINT "application_case_resumeId_fkey" FOREIGN KEY ("resumeId") REFERENCES "resume"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "analysis_run" ADD CONSTRAINT "analysis_run_applicationCaseId_fkey" FOREIGN KEY ("applicationCaseId") REFERENCES "application_case"("id") ON DELETE CASCADE ON UPDATE CASCADE;
