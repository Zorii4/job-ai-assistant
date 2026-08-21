import { fileURLToPath } from 'node:url';

import { PgBoss } from 'pg-boss';
import { Pool } from 'pg';

import {
  HRPreparationJobPayloadSchema,
  type HRPreparationJobPayload,
  InitialAnalysisJobPayloadSchema,
  type InitialAnalysisJobPayload,
  PostInterviewJobPayloadSchema,
  type PostInterviewJobPayload,
} from '@job-ai-assistant/contracts';

import { processHRPreparationJob, type HRPreparationUseCase } from './hr-preparation.worker.js';
import { processInitialAnalysisJob, type LegacyInitialAnalysis } from './initial-analysis.worker.js';
import { processPostInterviewJob, type PostInterviewUseCase } from './post-interview.worker.js';

const queueName = 'initial-analysis';
const hrPreparationQueueName = 'hr-preparation';
const postInterviewQueueName = 'post-interview';

type LegacyWorkflowModule = {
  createAnalyzeJobApplication: (dependencies: {
    persistence: {
      initializeRun(input: unknown): Promise<void>;
      saveStepOutput(runId: string, step: unknown): Promise<void>;
      saveFinal(runId: string, finalMarkdown: string): Promise<void>;
      saveMeta(runId: string, meta: unknown, steps: unknown[]): Promise<void>;
      cleanupOldRuns(): Promise<void>;
    };
    createRunId: () => string;
  }) => LegacyInitialAnalysis;
};

type HRPreparationWorkflowModule = {
  createPrepareForHrScreening: () => HRPreparationUseCase;
};

type PostInterviewWorkflowModule = {
  createAnalyzePostInterview: () => PostInterviewUseCase;
};

export const initialAnalysisWorkerOptions = {
  includeMetadata: true,
  batchSize: 1,
  localConcurrency: 2,
} as const;

export async function startWorker(): Promise<void> {
  loadProjectEnvironmentWhenMissing('POSTGRES_USER');
  const database = new Pool({ connectionString: getDatabaseUrl(), application_name: 'job-ai-assistant-worker' });
  const boss = new PgBoss({ connectionString: getDatabaseUrl(), application_name: 'job-ai-assistant-worker' });
  boss.on('error', () => console.error('[worker] pg-boss error'));
  await boss.start();
  await boss.createQueue(queueName, {
    retryLimit: 2,
    retryDelay: 5,
    retryBackoff: true,
    expireInSeconds: 900,
  });
  await boss.createQueue(hrPreparationQueueName, {
    retryLimit: 2,
    retryDelay: 5,
    retryBackoff: true,
    expireInSeconds: 600,
  });
  await boss.createQueue(postInterviewQueueName, {
    retryLimit: 2,
    retryDelay: 5,
    retryBackoff: true,
    expireInSeconds: 600,
  });

  const legacyWorkflow = await loadLegacyWorkflow();
  const hrPreparationWorkflow = await loadHRPreparationWorkflow();
  const postInterviewWorkflow = await loadPostInterviewWorkflow();
  await boss.work<InitialAnalysisJobPayload, void, typeof initialAnalysisWorkerOptions>(
    queueName,
    initialAnalysisWorkerOptions,
    async (jobs) => {
      for (const job of jobs) {
        const payload = InitialAnalysisJobPayloadSchema.parse(job.data);
        const runInitialAnalysis = legacyWorkflow.createAnalyzeJobApplication({
          persistence: createDatabasePersistence(database, payload.analysisRunId),
          createRunId: () => payload.analysisRunId,
        });

        try {
          await processInitialAnalysisJob(payload, {
            database,
            runInitialAnalysis,
            retryRemaining: job.retryCount < job.retryLimit,
          });
        } catch {
          console.error('[worker] initial analysis failed', { analysisRunId: payload.analysisRunId });
          throw new Error('initial_analysis_failed');
        }
      }
    },
  );
  await boss.work<HRPreparationJobPayload, void, typeof initialAnalysisWorkerOptions>(
    hrPreparationQueueName,
    initialAnalysisWorkerOptions,
    async (jobs) => {
      for (const job of jobs) {
        const payload = HRPreparationJobPayloadSchema.parse(job.data);

        try {
          await processHRPreparationJob(payload, {
            database,
            prepareForHrScreening: hrPreparationWorkflow.createPrepareForHrScreening(),
            retryRemaining: job.retryCount < job.retryLimit,
          });
        } catch {
          console.error('[worker] HR preparation persistence failed', { analysisRunId: payload.analysisRunId });
          throw new Error('hr_preparation_failed');
        }
      }
    },
  );
  await boss.work<PostInterviewJobPayload, void, typeof initialAnalysisWorkerOptions>(
    postInterviewQueueName,
    initialAnalysisWorkerOptions,
    async (jobs) => {
      for (const job of jobs) {
        const payload = PostInterviewJobPayloadSchema.parse(job.data);

        try {
          await processPostInterviewJob(payload, {
            database,
            analyzePostInterview: postInterviewWorkflow.createAnalyzePostInterview(),
            retryRemaining: job.retryCount < job.retryLimit,
          });
        } catch {
          console.error('[worker] post-interview persistence failed', { analysisRunId: payload.analysisRunId });
          throw new Error('post_interview_failed');
        }
      }
    },
  );

  const shutdown = async () => {
    await boss.stop({ graceful: true, close: true });
    await database.end();
  };
  process.once('SIGINT', () => void shutdown());
  process.once('SIGTERM', () => void shutdown());
}

function createDatabasePersistence(database: Pool, analysisRunId: string) {
  return {
    async initializeRun(): Promise<void> {},
    async saveStepOutput(): Promise<void> {},
    async saveFinal(runId: string, finalMarkdown: string): Promise<void> {
      if (runId !== analysisRunId) {
        throw new Error('Unexpected analysis run ID.');
      }

      await database.query(
        `UPDATE analysis_run SET "finalMarkdown" = $1, "updatedAt" = CURRENT_TIMESTAMP WHERE id = $2`,
        [finalMarkdown, analysisRunId],
      );
    },
    async saveMeta(): Promise<void> {},
    async cleanupOldRuns(): Promise<void> {},
  };
}

async function loadLegacyWorkflow(): Promise<LegacyWorkflowModule> {
  const modulePath = new URL('../../../dist/app/analyzeJobApplication.js', import.meta.url);
  return import(modulePath.href) as Promise<LegacyWorkflowModule>;
}

async function loadHRPreparationWorkflow(): Promise<HRPreparationWorkflowModule> {
  const modulePath = new URL('../../../dist/app/prepareForHrScreening.js', import.meta.url);
  return import(modulePath.href) as Promise<HRPreparationWorkflowModule>;
}

async function loadPostInterviewWorkflow(): Promise<PostInterviewWorkflowModule> {
  const modulePath = new URL('../../../dist/app/analyzePostInterview.js', import.meta.url);
  return import(modulePath.href) as Promise<PostInterviewWorkflowModule>;
}

function loadProjectEnvironmentWhenMissing(variableName: string): void {
  if (process.env[variableName] === undefined) {
    process.loadEnvFile(fileURLToPath(new URL('../../../.env', import.meta.url)));
  }
}

function getDatabaseUrl(): string {
  const user = getRequiredEnvironmentVariable('POSTGRES_USER');
  const password = getRequiredEnvironmentVariable('POSTGRES_PASSWORD');
  const database = getRequiredEnvironmentVariable('POSTGRES_DB');
  const host = process.env.POSTGRES_HOST ?? 'localhost';
  const port = process.env.POSTGRES_PORT ?? '5432';

  return `postgresql://${encodeURIComponent(user)}:${encodeURIComponent(password)}@${host}:${port}/${encodeURIComponent(database)}`;
}

function getRequiredEnvironmentVariable(name: string): string {
  const value = process.env[name];

  if (value === undefined || value.length === 0) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  void startWorker();
}
