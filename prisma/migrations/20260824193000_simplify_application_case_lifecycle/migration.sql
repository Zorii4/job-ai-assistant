-- Keep only user-facing vacancy states. Technical execution state stays on analysis_run.
-- No ApplicationCase rows are deleted by this migration.
ALTER TABLE "stage_event"
  ALTER COLUMN "fromStage" TYPE TEXT USING "fromStage"::TEXT,
  ALTER COLUMN "toStage" TYPE TEXT USING "toStage"::TEXT;

ALTER TABLE "application_case"
  ALTER COLUMN "status" DROP DEFAULT,
  ALTER COLUMN "status" TYPE TEXT USING "status"::TEXT;

UPDATE "stage_event"
SET "fromStage" = CASE WHEN "fromStage" IN ('REJECTED', 'OFFER') THEN "fromStage" ELSE 'IN_PROGRESS' END,
    "toStage" = CASE WHEN "toStage" IN ('REJECTED', 'OFFER') THEN "toStage" ELSE 'IN_PROGRESS' END;

UPDATE "application_case"
SET "status" = CASE WHEN "status" IN ('REJECTED', 'OFFER') THEN "status" ELSE 'IN_PROGRESS' END,
    "currentStage" = CASE WHEN "status" IN ('REJECTED', 'OFFER') THEN "status" ELSE 'IN_PROGRESS' END;

DROP TYPE "ApplicationCaseStatus";
CREATE TYPE "ApplicationCaseStatus" AS ENUM ('IN_PROGRESS', 'REJECTED', 'OFFER');

ALTER TABLE "stage_event"
  ALTER COLUMN "fromStage" TYPE "ApplicationCaseStatus" USING "fromStage"::"ApplicationCaseStatus",
  ALTER COLUMN "toStage" TYPE "ApplicationCaseStatus" USING "toStage"::"ApplicationCaseStatus";

ALTER TABLE "application_case"
  ALTER COLUMN "status" TYPE "ApplicationCaseStatus" USING "status"::"ApplicationCaseStatus",
  ALTER COLUMN "status" SET DEFAULT 'IN_PROGRESS';
