ALTER TYPE "ApplicationCaseStatus" ADD VALUE IF NOT EXISTS 'APPLIED';
ALTER TYPE "ApplicationCaseStatus" ADD VALUE IF NOT EXISTS 'WAITING_RESPONSE';
ALTER TYPE "ApplicationCaseStatus" ADD VALUE IF NOT EXISTS 'HR_INVITED';
ALTER TYPE "ApplicationCaseStatus" ADD VALUE IF NOT EXISTS 'HR_PREPARATION_READY';
ALTER TYPE "ApplicationCaseStatus" ADD VALUE IF NOT EXISTS 'HR_COMPLETED';
ALTER TYPE "ApplicationCaseStatus" ADD VALUE IF NOT EXISTS 'REJECTED';
ALTER TYPE "ApplicationCaseStatus" ADD VALUE IF NOT EXISTS 'OFFER';
ALTER TYPE "ApplicationCaseStatus" ADD VALUE IF NOT EXISTS 'ARCHIVED';

CREATE TYPE "StageEventSource" AS ENUM ('USER', 'SYSTEM', 'AI');

CREATE TABLE "stage_event" (
    "id" TEXT NOT NULL,
    "applicationCaseId" TEXT NOT NULL,
    "fromStage" "ApplicationCaseStatus" NOT NULL,
    "toStage" "ApplicationCaseStatus" NOT NULL,
    "source" "StageEventSource" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "stage_event_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "stage_event_applicationCaseId_createdAt_idx" ON "stage_event"("applicationCaseId", "createdAt");

ALTER TABLE "stage_event" ADD CONSTRAINT "stage_event_applicationCaseId_fkey"
  FOREIGN KEY ("applicationCaseId") REFERENCES "application_case"("id") ON DELETE CASCADE ON UPDATE CASCADE;
