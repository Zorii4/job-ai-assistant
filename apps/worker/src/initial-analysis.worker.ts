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
  existingFinalMarkdown: string | null;
};

type InitialArtifact = {
  type: 'RESUME_RECOMMENDATIONS' | 'COVER_LETTER' | 'RECRUITER_MESSAGE' | 'FOLLOW_UP';
  generatedContent: string;
};

type TerminalAnalysisErrorCode =
  | 'ANALYST_TIMEOUT'
  | 'ANALYST_NETWORK_ERROR'
  | 'ANALYST_RESPONSE_INVALID'
  | 'PRODUCER_TIMEOUT'
  | 'PRODUCER_NETWORK_ERROR'
  | 'PRODUCER_RESPONSE_INVALID'
  | 'CRITIC_TIMEOUT'
  | 'CRITIC_NETWORK_ERROR'
  | 'CRITIC_RESPONSE_INVALID'
  | 'FINAL_TIMEOUT'
  | 'FINAL_NETWORK_ERROR'
  | 'FINAL_RESPONSE_INVALID'
  | 'WORKFLOW_FAILED';

class RetryableInitialAnalysisFailure extends Error {
  constructor() {
    super('initial_analysis_transient_retry');
    this.name = 'RetryableInitialAnalysisFailure';
  }
}

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
    result = typeof claimed.existingFinalMarkdown === 'string' && claimed.existingFinalMarkdown.length > 0
      ? { finalMarkdown: claimed.existingFinalMarkdown }
      : await dependencies.runInitialAnalysis({
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
  } catch (error) {
    // The workflow owns its bounded request/model retries. A transient failure
    // can still happen after those attempts; PgBoss then resumes from the
    // persisted checkpoint without consuming another analysis unit.
    const terminalErrorCode = getTerminalAnalysisErrorCode(error);
    const shouldRetry = dependencies.retryRemaining && isRetryableInitialAnalysisFailure(terminalErrorCode);

    await markRunForRetryOrFailure(
      dependencies.database,
      job,
      shouldRetry,
      terminalErrorCode,
    );

    if (shouldRetry) {
      throw new RetryableInitialAnalysisFailure();
    }

    return;
  }

  try {
    const finalMarkdown = removeUngroundedCandidateIdentity(result.finalMarkdown);
    const artifacts = extractInitialArtifacts(finalMarkdown);

    if (artifacts !== null) {
      for (const artifact of artifacts) {
        await dependencies.database.query(
          `INSERT INTO artifact (id, "applicationCaseId", type, "generatedContent", "sourceRunId", "createdAt", "updatedAt")
           VALUES (concat('initial-', $4::text, '-', $2::text), $1, $2::"ArtifactType", $3, $4, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
           ON CONFLICT ("applicationCaseId", type) DO NOTHING`,
          [job.applicationCaseId, artifact.type, artifact.generatedContent, job.analysisRunId],
        );
      }
    }

    await dependencies.database.query(
      `UPDATE analysis_run
       SET status = 'SUCCEEDED', "currentStage" = NULL, "finalMarkdown" = $1,
           "errorCode" = NULL, "errorMessageSanitized" = NULL,
           "finishedAt" = CURRENT_TIMESTAMP, "updatedAt" = CURRENT_TIMESTAMP
       WHERE id = $2`,
      [finalMarkdown, job.analysisRunId],
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

export function removeUngroundedCandidateIdentity(finalMarkdown: string): string {
  const normalized = finalMarkdown.replace(/\r\n/g, '\n');
  const heading = '#### Сообщение рекрутеру\n';
  const start = normalized.indexOf(heading);

  if (start === -1) {
    return normalized;
  }

  const bodyStart = start + heading.length;
  const remainder = normalized.slice(bodyStart);
  const nextHeading = remainder.search(/^#### /m);
  const message = (nextHeading === -1 ? remainder : remainder.slice(0, nextHeading));
  const suffix = nextHeading === -1 ? '' : remainder.slice(nextHeading);

  return `${normalized.slice(0, bodyStart)}${removeCandidateIdentity(message)}${suffix}`;
}

function removeCandidateIdentity(message: string): string {
  const candidateName = "[\\p{Lu}][\\p{L}'’\\-]+(?:\\s+[\\p{Lu}][\\p{L}'’\\-]+){0,2}";
  const leadingWhitespace = message.match(/^\s*/u)?.[0] ?? '';
  const trailingWhitespace = message.match(/\s*$/u)?.[0] ?? '';
  const withoutIntroduction = message.trim()
    .replace(new RegExp(`Меня\\s+зовут\\s+${candidateName}\\s*[.!?]\\s*`, 'giu'), '')
    .replace(new RegExp(`(^|[.!?]\\s*)Я\\s*,\\s*${candidateName}\\s*[,—-]\\s*`, 'giu'), '$1Я ')
    .replace(new RegExp(`\\n\\s*(?:С\\s+уважением|С\\s+наилучшими\\s+пожеланиями)[,!.]?\\s*\\n\\s*${candidateName}\\s*$`, 'iu'), '');

  return `${leadingWhitespace}${withoutIntroduction.trim()}${trailingWhitespace}`;
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
     SET status = 'RUNNING', "currentStage" = COALESCE(run."currentStage", 'analyst'), "startedAt" = CURRENT_TIMESTAMP,
         "updatedAt" = CURRENT_TIMESTAMP
     FROM application_case AS application
     WHERE run.id = $1
       AND run."applicationCaseId" = $2
       AND run.status = 'QUEUED'
       AND application.id = run."applicationCaseId"
     RETURNING application."userId" AS "userId",
               application."resumeSanitizedText" AS "resumeSanitizedText",
               application."vacancySanitizedText" AS "vacancySanitizedText",
               run."finalMarkdown" AS "existingFinalMarkdown"`,
    [job.analysisRunId, job.applicationCaseId],
  );

  return result.rows[0] ?? null;
}

async function markRunForRetryOrFailure(
  database: WorkerDatabase,
  job: InitialAnalysisJobPayload,
  retryRemaining: boolean,
  terminalErrorCode: TerminalAnalysisErrorCode = 'WORKFLOW_FAILED',
  retryErrorCode: 'WORKFLOW_RETRY' = 'WORKFLOW_RETRY',
): Promise<void> {
  if (retryRemaining) {
    await database.query(
      `UPDATE analysis_run
       SET status = 'QUEUED', "errorCode" = $2,
           "errorMessageSanitized" = $2, "updatedAt" = CURRENT_TIMESTAMP
        WHERE id = $1`,
       [job.analysisRunId, retryErrorCode],
    );
    return;
  }

  await database.query(
    `UPDATE analysis_run
     SET status = 'FAILED', "currentStage" = NULL, "errorCode" = $2,
         "errorMessageSanitized" = $2, "finishedAt" = CURRENT_TIMESTAMP,
         "updatedAt" = CURRENT_TIMESTAMP
     WHERE id = $1`,
    [job.analysisRunId, terminalErrorCode],
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

function getTerminalAnalysisErrorCode(error: unknown): TerminalAnalysisErrorCode {
  if (typeof error !== 'object' || error === null) {
    return 'WORKFLOW_FAILED';
  }

  const record = error as Record<string, unknown>;
  const llmErrorCode = record.llmErrorCode;
  const stepName = record.stepName;

  if (
    llmErrorCode !== 'LLM_TIMEOUT' &&
    llmErrorCode !== 'LLM_NETWORK_ERROR' &&
    llmErrorCode !== 'LLM_RESPONSE_INVALID'
  ) {
    return 'WORKFLOW_FAILED';
  }

  const stage = getErrorStage(stepName);

  if (stage === undefined) {
    return 'WORKFLOW_FAILED';
  }

  const suffix = {
    LLM_TIMEOUT: 'TIMEOUT',
    LLM_NETWORK_ERROR: 'NETWORK_ERROR',
    LLM_RESPONSE_INVALID: 'RESPONSE_INVALID',
  }[llmErrorCode];

  return `${stage}_${suffix}` as TerminalAnalysisErrorCode;
}

function getErrorStage(stepName: unknown): 'ANALYST' | 'PRODUCER' | 'CRITIC' | 'FINAL' | undefined {
  if (stepName === 'analyst') return 'ANALYST';
  if (typeof stepName !== 'string') return undefined;
  if (stepName.startsWith('producer.')) return 'PRODUCER';
  if (stepName.startsWith('critic.')) return 'CRITIC';
  if (stepName === 'orchestrator.final') return 'FINAL';
  return undefined;
}

function isRetryableInitialAnalysisFailure(errorCode: TerminalAnalysisErrorCode): boolean {
  return (
    errorCode.endsWith('_TIMEOUT') ||
    errorCode.endsWith('_NETWORK_ERROR') ||
    errorCode === 'CRITIC_RESPONSE_INVALID'
  );
}
