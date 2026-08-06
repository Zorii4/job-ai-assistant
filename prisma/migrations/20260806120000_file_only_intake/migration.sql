-- Stage 6.5: direct text intake is no longer supported. Existing TEXT test data is
-- intentionally removed with its dependent application data before narrowing enums.
DELETE FROM "application_case"
WHERE "vacancySourceType" = 'TEXT'
   OR "resumeId" IN (SELECT "id" FROM "resume" WHERE "sourceType" = 'TEXT');

DELETE FROM "resume" WHERE "sourceType" = 'TEXT';

ALTER TYPE "ResumeSourceType" RENAME TO "ResumeSourceType_old";
CREATE TYPE "ResumeSourceType" AS ENUM ('FILE');
ALTER TABLE "resume"
  ALTER COLUMN "sourceType" TYPE "ResumeSourceType"
  USING "sourceType"::text::"ResumeSourceType";
DROP TYPE "ResumeSourceType_old";

ALTER TYPE "VacancySourceType" RENAME TO "VacancySourceType_old";
CREATE TYPE "VacancySourceType" AS ENUM ('FILE');
ALTER TABLE "application_case"
  ALTER COLUMN "vacancySourceType" TYPE "VacancySourceType"
  USING "vacancySourceType"::text::"VacancySourceType";
DROP TYPE "VacancySourceType_old";
