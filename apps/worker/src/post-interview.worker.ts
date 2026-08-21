import {
  PostInterviewJobPayloadSchema,
  type PostInterviewJobPayload,
  type PostInterviewResult,
} from '@job-ai-assistant/contracts';

import { type WorkerDatabase } from './initial-analysis.worker.js';

export type PostInterviewUseCase = (input: {
  sanitizedHrMessage: string;
  vacancyTextSnapshot: string;
  initialAnalysisFinalMarkdown: string;
}) => Promise<{
  result: PostInterviewResult;
  promptVersion: string;
}>;

type ClaimedPostInterviewRun = {
  sanitizedHrMessage: string;
  vacancyTextSnapshot: string;
  initialAnalysisFinalMarkdown: string;
};

export async function processPostInterviewJob(
  payload: PostInterviewJobPayload,
  dependencies: {
    database: WorkerDatabase;
    analyzePostInterview: PostInterviewUseCase;
    retryRemaining: boolean;
  },
): Promise<void> {
  const job = PostInterviewJobPayloadSchema.parse(payload);
  const claimed = await claimPostInterviewRun(dependencies.database, job);

  if (claimed === null) {
    return;
  }

  let output: Awaited<ReturnType<PostInterviewUseCase>>;

  try {
    output = await dependencies.analyzePostInterview(claimed);
  } catch (error) {
    await markPostInterviewRunFailed(dependencies.database, job, getPostInterviewErrorCode(error));
    return;
  }

  try {
    await dependencies.database.query(
      `WITH post_interview_review AS (
         INSERT INTO artifact ("applicationCaseId", type, "generatedContent", "sourceRunId", "createdAt", "updatedAt")
         VALUES ($1, 'POST_INTERVIEW_REVIEW'::"ArtifactType", $2, $3, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
         ON CONFLICT ("applicationCaseId", type) DO NOTHING
       ),
       hr_closing_message AS (
         INSERT INTO artifact ("applicationCaseId", type, "generatedContent", "sourceRunId", "createdAt", "updatedAt")
         VALUES ($1, 'HR_CLOSING_MESSAGE'::"ArtifactType", $4, $3, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
         ON CONFLICT ("applicationCaseId", type) DO NOTHING
       )
       UPDATE analysis_run
       SET status = 'SUCCEEDED', "currentStage" = NULL, "model" = $5, "promptVersion" = $6,
           "finishedAt" = CURRENT_TIMESTAMP, "updatedAt" = CURRENT_TIMESTAMP
       WHERE id = $3`,
      [
        job.applicationCaseId,
        output.result.analysisMarkdown,
        job.analysisRunId,
        output.result.hrClosingMessage,
        process.env.LLM_MODEL ?? null,
        output.promptVersion,
      ],
    );
  } catch {
    await markPostInterviewPersistenceFailure(dependencies.database, job, dependencies.retryRemaining);
    throw new Error('post_interview_persistence_failed');
  }
}

async function claimPostInterviewRun(
  database: WorkerDatabase,
  job: PostInterviewJobPayload,
): Promise<ClaimedPostInterviewRun | null> {
  const result = await database.query<ClaimedPostInterviewRun>(
    `UPDATE analysis_run AS run
     SET status = 'RUNNING', "currentStage" = NULL, "startedAt" = CURRENT_TIMESTAMP,
         "updatedAt" = CURRENT_TIMESTAMP
     FROM application_case AS application
     JOIN post_interview_input AS input ON input."applicationCaseId" = application.id
     WHERE run.id = $1
       AND run."applicationCaseId" = $2
       AND run."workflowType" = 'POST_INTERVIEW'
       AND run.status = 'QUEUED'
       AND application.id = run."applicationCaseId"
       AND application.status = 'HR_COMPLETED'
       AND EXISTS (
         SELECT 1 FROM analysis_run AS initial_run
         WHERE initial_run."applicationCaseId" = application.id
           AND initial_run."workflowType" = 'INITIAL_ANALYSIS'
           AND initial_run.status = 'SUCCEEDED'
           AND initial_run."finalMarkdown" IS NOT NULL
       )
     RETURNING input."sanitizedHrMessage" AS "sanitizedHrMessage",
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

async function markPostInterviewRunFailed(
  database: WorkerDatabase,
  job: PostInterviewJobPayload,
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

async function markPostInterviewPersistenceFailure(
  database: WorkerDatabase,
  job: PostInterviewJobPayload,
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

  await markPostInterviewRunFailed(database, job, 'PERSISTENCE_FAILED');
}

function getPostInterviewErrorCode(error: unknown): 'POST_INTERVIEW_TIMEOUT' | 'POST_INTERVIEW_NETWORK_ERROR' | 'POST_INTERVIEW_RESPONSE_INVALID' | 'POST_INTERVIEW_FAILED' {
  const message = error instanceof Error ? error.message : String(error);

  if (/timed out|timeout|aborted/i.test(message)) return 'POST_INTERVIEW_TIMEOUT';
  if (/fetch failed|network error|connection|socket/i.test(message)) return 'POST_INTERVIEW_NETWORK_ERROR';
  if (/invalid|JSON|truncated|contract/i.test(message)) return 'POST_INTERVIEW_RESPONSE_INVALID';

  return 'POST_INTERVIEW_FAILED';
}
