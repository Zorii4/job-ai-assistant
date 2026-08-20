import { Injectable, type OnModuleDestroy } from '@nestjs/common';
import { PgBoss } from 'pg-boss';

import {
  HRPreparationJobPayloadSchema,
  type HRPreparationJobPayload,
  InitialAnalysisJobPayloadSchema,
  type InitialAnalysisJobPayload,
} from '@job-ai-assistant/contracts';

import { getDatabaseUrl } from '../database/prisma.service.js';

export const INITIAL_ANALYSIS_QUEUE = 'initial-analysis';
export const HR_PREPARATION_QUEUE = 'hr-preparation';

@Injectable()
export class JobsService implements OnModuleDestroy {
  private bossPromise: Promise<PgBoss> | undefined;

  async enqueueInitialAnalysis(payload: InitialAnalysisJobPayload): Promise<string> {
    const job = InitialAnalysisJobPayloadSchema.parse(payload);
    const boss = await this.getBoss();
    const jobId = await boss.send(INITIAL_ANALYSIS_QUEUE, job, {
      singletonKey: job.analysisRunId,
    });

    if (jobId === null) {
      throw new Error('Failed to enqueue initial analysis job.');
    }

    return jobId;
  }

  async enqueueHrPreparation(payload: HRPreparationJobPayload): Promise<string> {
    const job = HRPreparationJobPayloadSchema.parse(payload);
    const boss = await this.getBoss();
    const jobId = await boss.send(HR_PREPARATION_QUEUE, job, {
      singletonKey: job.analysisRunId,
    });

    if (jobId === null) {
      throw new Error('Failed to enqueue HR preparation job.');
    }

    return jobId;
  }

  async onModuleDestroy(): Promise<void> {
    if (this.bossPromise !== undefined) {
      const boss = await this.bossPromise;
      await boss.stop({ graceful: true, close: true });
    }
  }

  private getBoss(): Promise<PgBoss> {
    if (this.bossPromise === undefined) {
      this.bossPromise = this.startBoss();
    }

    return this.bossPromise;
  }

  private async startBoss(): Promise<PgBoss> {
    const boss = new PgBoss({
      connectionString: getDatabaseUrl(),
      application_name: 'job-ai-assistant-api',
    });
    boss.on('error', () => {
      console.error('[jobs] pg-boss error');
    });
    await boss.start();
    await boss.createQueue(INITIAL_ANALYSIS_QUEUE, {
      retryLimit: 2,
      retryDelay: 5,
      retryBackoff: true,
      expireInSeconds: 900,
    });
    await boss.createQueue(HR_PREPARATION_QUEUE, {
      retryLimit: 2,
      retryDelay: 5,
      retryBackoff: true,
      expireInSeconds: 600,
    });

    return boss;
  }
}
