ALTER TABLE "analysis_run"
  ADD COLUMN "initialWorkflowCheckpoint" JSONB,
  ADD COLUMN "initialWorkflowCheckpointFingerprint" TEXT;
