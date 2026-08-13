import {
  InitialAnalysisJobPayloadSchema,
  type InitialAnalysisJobPayload,
} from '@job-ai-assistant/contracts';

type QueryResult<Row> = { rows: Row[] };

export type WorkerDatabase = {
  query<Row extends Record<string, unknown>>(
    text: string,
    values: readonly unknown[],
  ): Promise<QueryResult<Row>>;
};

export type LegacyInitialAnalysis = (input: {
  resumeText: string;
  vacancyText: string;
  source: 'web';
  userId: string;
  onProgress: (event: { stage: string }) => Promise<void>;
}) => Promise<{ finalMarkdown: string }>;

type ClaimedRun = {
  userId: string;
  resumeSanitizedText: string;
  vacancySanitizedText: string;
};

type InitialArtifact = {
  type: 'RESUME_RECOMMENDATIONS' | 'COVER_LETTER' | 'RECRUITER_MESSAGE' | 'FOLLOW_UP';
  generatedContent: string;
};

export async function processInitialAnalysisJob(
  payload: InitialAnalysisJobPayload,
  dependencies: {
    database: WorkerDatabase;
    runInitialAnalysis: LegacyInitialAnalysis;
    retryRemaining: boolean;
  },
): Promise<void> {
  const job = InitialAnalysisJobPayloadSchema.parse(payload);
  const claimed = await claimRun(dependencies.database, job);

  if (claimed === null) {
    return;
  }

  let result: { finalMarkdown: string };

  try {
    result = await dependencies.runInitialAnalysis({
      resumeText: claimed.resumeSanitizedText,
      vacancyText: claimed.vacancySanitizedText,
      source: 'web',
      userId: claimed.userId,
      onProgress: async ({ stage }) => {
        try {
          await dependencies.database.query(
            `UPDATE analysis_run
             SET "currentStage" = $1, "updatedAt" = CURRENT_TIMESTAMP
             WHERE id = $2`,
            [stage, job.analysisRunId],
          );
        } catch {
          console.error('[worker] could not persist analysis progress', { analysisRunId: job.analysisRunId });
        }
      },
    });
  } catch {
    // LLM workflow already owns its bounded model retries. Re-running the full
    // Analyst -> Producer -> Critic pipeline would duplicate cost and hide the
    // actual terminal outcome from the user.
    await markRunForRetryOrFailure(dependencies.database, job, false);
    return;
  }

  try {
    const artifacts = extractInitialArtifacts(result.finalMarkdown);

    if (artifacts !== null) {
      for (const artifact of artifacts) {
        await dependencies.database.query(
          `INSERT INTO artifact ("applicationCaseId", type, "generatedContent", "sourceRunId", "createdAt", "updatedAt")
           VALUES ($1, $2::"ArtifactType", $3, $4, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
           ON CONFLICT ("applicationCaseId", type) DO NOTHING`,
          [job.applicationCaseId, artifact.type, artifact.generatedContent, job.analysisRunId],
        );
      }
    }

    await dependencies.database.query(
      `UPDATE analysis_run
       SET status = 'SUCCEEDED', "currentStage" = NULL, "finalMarkdown" = $1,
           "finishedAt" = CURRENT_TIMESTAMP, "updatedAt" = CURRENT_TIMESTAMP
       WHERE id = $2`,
      [result.finalMarkdown, job.analysisRunId],
    );
    await dependencies.database.query(
      `UPDATE application_case
       SET status = 'ANALYSIS_READY', "currentStage" = 'ANALYSIS_READY', "updatedAt" = CURRENT_TIMESTAMP
       WHERE id = $1`,
      [job.applicationCaseId],
    );
  } catch {
    // A persistence error after a completed workflow may be retried by PgBoss.
    // The artifact inserts are idempotent and the run is atomically claimed again.
    await markRunForRetryOrFailure(dependencies.database, job, dependencies.retryRemaining);
    throw new Error('initial_analysis_failed');
  }
}

export function extractInitialArtifacts(finalMarkdown: string): InitialArtifact[] | null {
  const normalized = finalMarkdown.replace(/\r\n/g, '\n');
  const resumeRecommendations = getMarkdownSection(normalized, '### Блоки для резюме', '###');
  const readyTexts = getMarkdownSection(normalized, '### Готовые тексты', undefined);

  if (resumeRecommendations === null || readyTexts === null) {
    return null;
  }

  const coverLetter = getMarkdownSection(readyTexts, '#### Сопроводительное письмо', '####');
  const recruiterMessage = getMarkdownSection(readyTexts, '#### Сообщение рекрутеру', '####');
  const followUp = getMarkdownSection(readyTexts, '#### Follow-up', '####');

  if (coverLetter === null || recruiterMessage === null || followUp === null) {
    return null;
  }

  return [
    { type: 'RESUME_RECOMMENDATIONS', generatedContent: resumeRecommendations },
    { type: 'COVER_LETTER', generatedContent: coverLetter },
    { type: 'RECRUITER_MESSAGE', generatedContent: recruiterMessage },
    { type: 'FOLLOW_UP', generatedContent: followUp },
  ];
}

function getMarkdownSection(markdown: string, heading: string, nextHeadingLevel: '###' | '####' | undefined): string | null {
  const start = markdown.indexOf(`${heading}\n`);

  if (start === -1) {
    return null;
  }

  const bodyStart = start + heading.length + 1;
  const remainder = markdown.slice(bodyStart);
  const next = nextHeadingLevel === undefined ? -1 : remainder.search(new RegExp(`^${nextHeadingLevel} `, 'm'));
  const content = (next === -1 ? remainder : remainder.slice(0, next)).trim();

  return content.length > 0 ? content : null;
}

async function claimRun(
  database: WorkerDatabase,
  job: InitialAnalysisJobPayload,
): Promise<ClaimedRun | null> {
  const result = await database.query<ClaimedRun>(
    `UPDATE analysis_run AS run
     SET status = 'RUNNING', "currentStage" = 'analyst', "startedAt" = CURRENT_TIMESTAMP,
         "updatedAt" = CURRENT_TIMESTAMP
     FROM application_case AS application
     WHERE run.id = $1
       AND run."applicationCaseId" = $2
       AND run.status = 'QUEUED'
       AND application.id = run."applicationCaseId"
       AND application.status = 'ANALYZING'
     RETURNING application."userId" AS "userId",
               application."resumeSanitizedText" AS "resumeSanitizedText",
               application."vacancySanitizedText" AS "vacancySanitizedText"`,
    [job.analysisRunId, job.applicationCaseId],
  );

  return result.rows[0] ?? null;
}

async function markRunForRetryOrFailure(
  database: WorkerDatabase,
  job: InitialAnalysisJobPayload,
  retryRemaining: boolean,
): Promise<void> {
  if (retryRemaining) {
    await database.query(
      `UPDATE analysis_run
       SET status = 'QUEUED', "currentStage" = NULL, "errorCode" = 'WORKFLOW_RETRY',
           "errorMessageSanitized" = 'WORKFLOW_RETRY', "updatedAt" = CURRENT_TIMESTAMP
       WHERE id = $1`,
      [job.analysisRunId],
    );
    return;
  }

  await database.query(
    `UPDATE analysis_run
     SET status = 'FAILED', "currentStage" = NULL, "errorCode" = 'WORKFLOW_FAILED',
         "errorMessageSanitized" = 'WORKFLOW_FAILED', "finishedAt" = CURRENT_TIMESTAMP,
         "updatedAt" = CURRENT_TIMESTAMP
     WHERE id = $1`,
    [job.analysisRunId],
  );
  await database.query(
    `UPDATE application_case
     SET status = 'FAILED', "currentStage" = 'FAILED', "updatedAt" = CURRENT_TIMESTAMP
     WHERE id = $1`,
    [job.applicationCaseId],
  );
  await database.query(
    `UPDATE "user" AS account
     SET "initialAnalysisUnitsUsed" = GREATEST(account."initialAnalysisUnitsUsed" - 1, 0),
         "updatedAt" = CURRENT_TIMESTAMP
     FROM application_case AS application
     WHERE application.id = $1 AND account.id = application."userId"`,
    [job.applicationCaseId],
  );
}
