import {
  HRPreparationJobPayloadSchema,
  type HRPreparationJobPayload,
  type HRPreparationResult,
} from '@job-ai-assistant/contracts';

import { type WorkerDatabase } from './initial-analysis.worker.js';

export type HRPreparationUseCase = (input: {
  resumeSanitizedSnapshot: string;
  vacancyTextSnapshot: string;
  initialAnalysisFinalMarkdown: string;
}) => Promise<{
  result: HRPreparationResult;
  promptVersion: string;
}>;

type ClaimedHRPreparationRun = {
  resumeSanitizedSnapshot: string;
  vacancyTextSnapshot: string;
  initialAnalysisFinalMarkdown: string;
};

export async function processHRPreparationJob(
  payload: HRPreparationJobPayload,
  dependencies: {
    database: WorkerDatabase;
    prepareForHrScreening: HRPreparationUseCase;
    retryRemaining: boolean;
  },
): Promise<void> {
  const job = HRPreparationJobPayloadSchema.parse(payload);
  const claimed = await claimHRPreparationRun(dependencies.database, job);

  if (claimed === null) {
    return;
  }

  let output: Awaited<ReturnType<HRPreparationUseCase>>;

  try {
    output = await dependencies.prepareForHrScreening(claimed);
  } catch (error) {
    await markHRPreparationRunFailed(dependencies.database, job, getHRPreparationErrorCode(error));
    return;
  }

  try {
    const generatedContent = formatHRPreparationMaterial(output.result);
    await dependencies.database.query(
      `WITH saved_artifact AS (
         INSERT INTO artifact (id, "applicationCaseId", type, "generatedContent", "sourceRunId", "createdAt", "updatedAt")
         VALUES (concat('hr-preparation-', $3::text), $1, 'HR_SCREENING_PREPARATION'::"ArtifactType", $2, $3, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
         ON CONFLICT ("applicationCaseId", type) DO UPDATE
           SET "sourceRunId" = artifact."sourceRunId"
         RETURNING "applicationCaseId"
       ), completed_run AS (
         UPDATE analysis_run AS run
         SET status = 'SUCCEEDED', "currentStage" = NULL, "model" = $4, "promptVersion" = $5,
             "errorCode" = NULL, "errorMessageSanitized" = NULL,
             "finishedAt" = CURRENT_TIMESTAMP, "updatedAt" = CURRENT_TIMESTAMP
         FROM saved_artifact
         WHERE run.id = $3
           AND run."applicationCaseId" = saved_artifact."applicationCaseId"
         RETURNING run."applicationCaseId"
       )
       SELECT "applicationCaseId" FROM completed_run`,
      [
        job.applicationCaseId,
        generatedContent,
        job.analysisRunId,
        process.env.LLM_MODEL ?? null,
        output.promptVersion,
      ],
    );
  } catch {
    await markHRPreparationPersistenceFailure(dependencies.database, job, dependencies.retryRemaining);
    throw new Error('hr_preparation_persistence_failed');
  }
}

export function formatHRPreparationMaterial(result: HRPreparationResult): string {
  return [
    '## Подготовка к HR-скринингу',
    ...result.items.flatMap((item, index) => [
      '',
      `### ${index + 1}. ${item.question}`,
      '',
      item.answer,
    ]),
  ].join('\n');
}

async function claimHRPreparationRun(
  database: WorkerDatabase,
  job: HRPreparationJobPayload,
): Promise<ClaimedHRPreparationRun | null> {
  const result = await database.query<ClaimedHRPreparationRun>(
    `UPDATE analysis_run AS run
     SET status = 'RUNNING', "currentStage" = NULL, "startedAt" = CURRENT_TIMESTAMP,
         "updatedAt" = CURRENT_TIMESTAMP
     FROM application_case AS application
     WHERE run.id = $1
       AND run."applicationCaseId" = $2
       AND run."workflowType" = 'HR_PREPARATION'
       AND run.status = 'QUEUED'
       AND application.id = run."applicationCaseId"
       AND EXISTS (
         SELECT 1 FROM analysis_run AS initial_run
         WHERE initial_run."applicationCaseId" = application.id
           AND initial_run."workflowType" = 'INITIAL_ANALYSIS'
           AND initial_run.status = 'SUCCEEDED'
           AND initial_run."finalMarkdown" IS NOT NULL
       )
     RETURNING application."resumeSanitizedText" AS "resumeSanitizedSnapshot",
               application."vacancySanitizedText" AS "vacancyTextSnapshot",
               (
                 SELECT initial_run."finalMarkdown" FROM analysis_run AS initial_run
                 WHERE initial_run."applicationCaseId" = application.id
                   AND initial_run."workflowType" = 'INITIAL_ANALYSIS'
                   AND initial_run.status = 'SUCCEEDED'
               ) AS "initialAnalysisFinalMarkdown"`,
    [job.analysisRunId, job.applicationCaseId],
  );

  return result.rows[0] ?? null;
}

async function markHRPreparationRunFailed(
  database: WorkerDatabase,
  job: HRPreparationJobPayload,
  errorCode: string,
): Promise<void> {
  await database.query(
    `UPDATE analysis_run
     SET status = 'FAILED', "currentStage" = NULL, "errorCode" = $2,
         "errorMessageSanitized" = $2, "finishedAt" = CURRENT_TIMESTAMP,
         "updatedAt" = CURRENT_TIMESTAMP
     WHERE id = $1`,
    [job.analysisRunId, errorCode],
  );
}

async function markHRPreparationPersistenceFailure(
  database: WorkerDatabase,
  job: HRPreparationJobPayload,
  retryRemaining: boolean,
): Promise<void> {
  if (retryRemaining) {
    await database.query(
      `UPDATE analysis_run
       SET status = 'QUEUED', "currentStage" = NULL, "errorCode" = 'PERSISTENCE_RETRY',
           "errorMessageSanitized" = 'PERSISTENCE_RETRY', "updatedAt" = CURRENT_TIMESTAMP
       WHERE id = $1`,
      [job.analysisRunId],
    );
    return;
  }

  await markHRPreparationRunFailed(database, job, 'PERSISTENCE_FAILED');
}

function getHRPreparationErrorCode(error: unknown): 'HR_PREPARATION_TIMEOUT' | 'HR_PREPARATION_NETWORK_ERROR' | 'HR_PREPARATION_RESPONSE_INVALID' | 'HR_PREPARATION_FAILED' {
  const message = error instanceof Error ? error.message : String(error);

  if (/timed out|timeout|aborted/i.test(message)) return 'HR_PREPARATION_TIMEOUT';
  if (/fetch failed|network error|connection|socket/i.test(message)) return 'HR_PREPARATION_NETWORK_ERROR';
  if (/invalid|JSON|truncated|contract/i.test(message)) return 'HR_PREPARATION_RESPONSE_INVALID';

  return 'HR_PREPARATION_FAILED';
}
