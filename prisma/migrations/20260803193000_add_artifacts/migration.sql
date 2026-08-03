CREATE TYPE "ArtifactType" AS ENUM ('RESUME_RECOMMENDATIONS', 'COVER_LETTER', 'RECRUITER_MESSAGE', 'FOLLOW_UP');

CREATE TABLE "artifact" (
    "id" TEXT NOT NULL,
    "applicationCaseId" TEXT NOT NULL,
    "type" "ArtifactType" NOT NULL,
    "generatedContent" TEXT NOT NULL,
    "editedContent" TEXT,
    "sourceRunId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "artifact_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "artifact_applicationCaseId_type_key" ON "artifact"("applicationCaseId", "type");
CREATE INDEX "artifact_sourceRunId_idx" ON "artifact"("sourceRunId");

ALTER TABLE "artifact" ADD CONSTRAINT "artifact_applicationCaseId_fkey" FOREIGN KEY ("applicationCaseId") REFERENCES "application_case"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "artifact" ADD CONSTRAINT "artifact_sourceRunId_fkey" FOREIGN KEY ("sourceRunId") REFERENCES "analysis_run"("id") ON DELETE CASCADE ON UPDATE CASCADE;
