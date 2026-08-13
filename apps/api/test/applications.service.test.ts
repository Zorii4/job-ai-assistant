import assert from 'node:assert/strict';
import test from 'node:test';

import { BadRequestException, NotFoundException } from '@nestjs/common';

import { Prisma } from '../src/generated/prisma/client.js';
import { ApplicationsService } from '../src/applications/applications.service.js';
import { AnalysisCapacityExceededException } from '../src/applications/analysis-capacity-exceeded.exception.js';
import { AnalysisQuotaExceededException } from '../src/applications/analysis-quota-exceeded.exception.js';

const createdAt = new Date('2026-08-03T18:00:00.000Z');

function createApplicationCaseRecord() {
  return {
    id: 'application-1',
    title: 'Backend developer',
    resumeId: 'resume-1',
    vacancySourceType: 'FILE' as const,
    status: 'DRAFT' as const,
    currentStage: 'DRAFT',
    createdAt,
    updatedAt: createdAt,
  };
}

test('creates a vacancy draft with a confirmed sanitized resume snapshot', async () => {
  let createArguments: unknown;
  const database = {
    resume: {
      async findFirst(arguments_: unknown) {
        if ((arguments_ as { where: { sanitizationStatus?: string } }).where.sanitizationStatus === 'CONFIRMED') {
          return { sanitizedText: '[EMAIL_1] опыт' };
        }

        return { id: 'resume-1' };
      },
    },
    applicationCase: {
      async create(arguments_: unknown) {
        createArguments = arguments_;
        return createApplicationCaseRecord();
      },
    },
  };
  const service = new ApplicationsService(database as never);

  const result = await service.createFileDraftForUser('user-1', { title: 'Backend developer', resumeId: 'resume-1' }, { sourceFileName: 'vacancy.txt', sourceText: 'Компания: Acme\nКонтакт: hr@example.com\nNode.js developer' });

  assert.deepEqual(result, {
    id: 'application-1',
    title: 'Backend developer',
    resumeId: 'resume-1',
    vacancySourceType: 'FILE',
    status: 'DRAFT',
    currentStage: 'DRAFT',
    createdAt: '2026-08-03T18:00:00.000Z',
    updatedAt: '2026-08-03T18:00:00.000Z',
  });
  assert.deepEqual(createArguments, {
    data: {
      userId: 'user-1',
      resumeId: 'resume-1',
      title: 'Backend developer',
      vacancySourceType: 'FILE',
      vacancySourceFileName: 'vacancy.txt',
      vacancySourceText: 'Компания: Acme\nКонтакт: hr@example.com\nNode.js developer',
      vacancySanitizedText: 'Компания: [EMPLOYER_1]\nКонтакт: [EMAIL_1]\nNode.js developer',
      resumeSanitizedText: '[EMAIL_1] опыт',
    },
    select: {
      id: true,
      title: true,
      resumeId: true,
      vacancySourceType: true,
      status: true,
      currentStage: true,
      createdAt: true,
      updatedAt: true,
    },
  });
});

test('creates a file vacancy draft with the safe file name', async () => {
  let createArguments: unknown;
  const database = {
    resume: {
      async findFirst() {
        return { sanitizedText: '[EMAIL_1] опыт' };
      },
    },
    applicationCase: {
      async create(arguments_: unknown) {
        createArguments = arguments_;
        return { ...createApplicationCaseRecord(), vacancySourceType: 'FILE' as const };
      },
    },
  };
  const service = new ApplicationsService(database as never);

  await service.createFileDraftForUser(
    'user-1',
    { title: 'Backend developer', resumeId: 'resume-1' },
    { sourceFileName: 'vacancy.txt', sourceText: 'Node.js developer' },
  );

  assert.deepEqual((createArguments as { data: unknown }).data, {
    userId: 'user-1',
    resumeId: 'resume-1',
    title: 'Backend developer',
    vacancySourceType: 'FILE',
    vacancySourceFileName: 'vacancy.txt',
    vacancySourceText: 'Node.js developer',
    vacancySanitizedText: 'Node.js developer',
    resumeSanitizedText: '[EMAIL_1] опыт',
  });
});

test('requires a confirmed resume before creating a vacancy', async () => {
  const database = {
    resume: {
      async findFirst(arguments_: unknown) {
        if ((arguments_ as { where: { sanitizationStatus?: string } }).where.sanitizationStatus === 'CONFIRMED') {
          return null;
        }

        return { id: 'resume-1' };
      },
    },
  };
  const service = new ApplicationsService(database as never);

  await assert.rejects(
    service.createFileDraftForUser('user-1', { title: 'Backend developer', resumeId: 'resume-1' }, { sourceFileName: 'vacancy.txt', sourceText: 'Node.js developer' }),
    (error: unknown) => error instanceof BadRequestException,
  );
});

test('lists only the owners analysis snapshots without source texts', async () => {
  let findArguments: unknown;
  const database = {
    applicationCase: {
      async findMany(arguments_: unknown) {
        findArguments = arguments_;
        return [{
          id: 'application-1',
          title: 'Backend developer',
          status: 'ANALYZING' as const,
          currentStage: 'ANALYZING',
          updatedAt: createdAt,
          analysisRuns: [{
            id: 'run-1',
            applicationCaseId: 'application-1',
            workflowType: 'INITIAL_ANALYSIS' as const,
            status: 'RUNNING' as const,
            currentStage: 'producer',
            errorCode: null,
            createdAt,
            updatedAt: createdAt,
          }],
        }];
      },
    },
  };
  const service = new ApplicationsService(database as never);

  const result = await service.listAnalysisCasesForUser('user-1');

  assert.deepEqual(result, [{
    id: 'application-1',
    title: 'Backend developer',
    status: 'ANALYZING',
    currentStage: 'ANALYZING',
    updatedAt: '2026-08-03T18:00:00.000Z',
    analysisRun: {
      id: 'run-1',
      applicationCaseId: 'application-1',
      workflowType: 'INITIAL_ANALYSIS',
      status: 'RUNNING',
      currentStage: 'producer',
      errorCode: null,
      createdAt: '2026-08-03T18:00:00.000Z',
      updatedAt: '2026-08-03T18:00:00.000Z',
    },
  }]);
  assert.deepEqual(findArguments, {
    where: { userId: 'user-1' },
    orderBy: { updatedAt: 'desc' },
    select: {
      id: true,
      title: true,
      status: true,
      currentStage: true,
      updatedAt: true,
      analysisRuns: {
        select: {
          id: true,
          applicationCaseId: true,
          workflowType: true,
          status: true,
          currentStage: true,
          errorCode: true,
          createdAt: true,
          updatedAt: true,
        },
      },
    },
  });
});

test('starts one queued initial analysis and enqueues identifiers only', async () => {
  let queuePayload: unknown;
  let applicationUpdate: unknown;
  let runCreate: unknown;
  let queueJobUpdate: unknown;
  let usageReservation: unknown;
  const database = {
    async $transaction(callbackOrOperations: unknown) {
      if (typeof callbackOrOperations === 'function') {
        return callbackOrOperations(this);
      }

      return Promise.all(callbackOrOperations as Promise<unknown>[]);
    },
    applicationCase: {
      async findFirst() {
        return { id: 'application-1', status: 'DRAFT' as const };
      },
      async update(arguments_: unknown) {
        applicationUpdate = arguments_;
        return {};
      },
    },
    user: {
      async findUnique() { return { planCode: 'ALPHA' }; },
      async updateMany(arguments_: unknown) {
        usageReservation = arguments_;
        return { count: 1 };
      },
      async update() { return {}; },
    },
    analysisRun: {
      async count() { return 0; },
      async create(arguments_: unknown) {
        runCreate = arguments_;
        return {
          id: 'run-1',
          applicationCaseId: 'application-1',
          workflowType: 'INITIAL_ANALYSIS' as const,
          status: 'QUEUED' as const,
          currentStage: null,
          errorCode: null,
          createdAt,
          updatedAt: createdAt,
        };
      },
      async update(arguments_: unknown) {
        queueJobUpdate = arguments_;
        return {};
      },
    },
  };
  const jobs = {
    async enqueueInitialAnalysis(payload: unknown) {
      queuePayload = payload;
      return 'queue-job-1';
    },
  };
  const service = new ApplicationsService(database as never, jobs as never);

  const result = await service.launchInitialAnalysisForUser('user-1', 'application-1');

  assert.deepEqual(result, {
    id: 'run-1',
    applicationCaseId: 'application-1',
    workflowType: 'INITIAL_ANALYSIS',
    status: 'QUEUED',
    currentStage: null,
    errorCode: null,
    createdAt: '2026-08-03T18:00:00.000Z',
    updatedAt: '2026-08-03T18:00:00.000Z',
  });
  assert.deepEqual(queuePayload, { applicationCaseId: 'application-1', analysisRunId: 'run-1' });
  assert.deepEqual(applicationUpdate, {
    where: { id: 'application-1' },
    data: { status: 'ANALYZING' },
  });
  assert.deepEqual(usageReservation, {
    where: { id: 'user-1', initialAnalysisUnitsUsed: { lt: 10 } },
    data: { initialAnalysisUnitsUsed: { increment: 1 } },
  });
  assert.deepEqual(runCreate, {
    data: {
      applicationCaseId: 'application-1',
      workflowType: 'INITIAL_ANALYSIS',
      status: 'QUEUED',
    },
    select: {
      id: true,
      applicationCaseId: true,
      workflowType: true,
      status: true,
      currentStage: true,
      errorCode: true,
      createdAt: true,
      updatedAt: true,
    },
  });
  assert.deepEqual(queueJobUpdate, {
    where: { id: 'run-1' },
    data: { queueJobId: 'queue-job-1' },
  });
});

test('rejects a third active initial analysis before reserving quota or creating a run', async () => {
  let usageReservationAttempted = false;
  let runCreationAttempted = false;
  const database = {
    async $transaction(callback: (transaction: unknown) => Promise<unknown>) { return callback(this); },
    applicationCase: {
      async findFirst() { return { id: 'application-3', status: 'DRAFT' as const }; },
      async update() { return {}; },
    },
    user: {
      async findUnique() { return { planCode: 'ALPHA' }; },
      async updateMany() { usageReservationAttempted = true; return { count: 1 }; },
    },
    analysisRun: {
      async count(arguments_: unknown) {
        assert.deepEqual(arguments_, {
          where: {
            workflowType: 'INITIAL_ANALYSIS',
            status: { in: ['QUEUED', 'RUNNING'] },
            applicationCase: { userId: 'user-1' },
          },
        });
        return 2;
      },
      async create() { runCreationAttempted = true; return {}; },
    },
  };
  const service = new ApplicationsService(database as never, { async enqueueInitialAnalysis() { return 'job'; } } as never);

  await assert.rejects(
    service.launchInitialAnalysisForUser('user-1', 'application-3'),
    (error: unknown) => error instanceof AnalysisCapacityExceededException,
  );
  assert.equal(usageReservationAttempted, false);
  assert.equal(runCreationAttempted, false);
});

test('allows a new analysis after either terminal run status releases active capacity', async () => {
  for (const terminalStatus of ['SUCCEEDED', 'FAILED'] as const) {
    let runCreated = false;
    const existingStatuses = ['QUEUED', terminalStatus];
    const database = {
      async $transaction(callback: (transaction: unknown) => Promise<unknown>) { return callback(this); },
      applicationCase: {
        async findFirst() { return { id: `application-${terminalStatus}`, status: 'DRAFT' as const }; },
        async update() { return {}; },
      },
      user: {
        async findUnique() { return { planCode: 'ALPHA' }; },
        async updateMany() { return { count: 1 }; },
      },
      analysisRun: {
        async count(arguments_: { where: { status: { in: string[] } } }) {
          return existingStatuses.filter((status) => arguments_.where.status.in.includes(status)).length;
        },
        async create() {
          runCreated = true;
          return {
            id: `run-${terminalStatus}`,
            applicationCaseId: `application-${terminalStatus}`,
            workflowType: 'INITIAL_ANALYSIS' as const,
            status: 'QUEUED' as const,
            currentStage: null,
            errorCode: null,
            createdAt,
            updatedAt: createdAt,
          };
        },
        async update() { return {}; },
      },
    };
    const service = new ApplicationsService(database as never, { async enqueueInitialAnalysis() { return 'job'; } } as never);

    await service.launchInitialAnalysisForUser('user-1', `application-${terminalStatus}`);

    assert.equal(runCreated, true, `${terminalStatus} must not consume active capacity`);
  }
});

test('retries a serialization conflict before starting one initial analysis', async () => {
  let transactionCalls = 0;
  let createdRuns = 0;
  const database = {
    async $transaction(callback: (transaction: unknown) => Promise<unknown>, options: unknown) {
      transactionCalls += 1;
      assert.deepEqual(options, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
      if (transactionCalls === 1) throw new Prisma.PrismaClientKnownRequestError('retry', { code: 'P2034', clientVersion: 'test' });
      return callback(this);
    },
    applicationCase: { async findFirst() { return { id: 'application-1', status: 'DRAFT' as const }; }, async update() { return {}; } },
    user: { async findUnique() { return { planCode: 'ALPHA' }; }, async updateMany() { return { count: 1 }; }, async update() { return {}; } },
    analysisRun: {
      async count() { return 1; },
      async create() { createdRuns += 1; return { id: 'run-1', applicationCaseId: 'application-1', workflowType: 'INITIAL_ANALYSIS' as const, status: 'QUEUED' as const, currentStage: null, errorCode: null, createdAt, updatedAt: createdAt }; },
      async update() { return {}; },
    },
  };
  const service = new ApplicationsService(database as never, { async enqueueInitialAnalysis() { return 'job-1'; } } as never);

  await service.launchInitialAnalysisForUser('user-1', 'application-1');

  assert.equal(transactionCalls, 2);
  assert.equal(createdRuns, 1);
});

test('does not start an analysis when all ten lifetime units are reserved', async () => {
  let runCreated = false;
  const database = {
    async $transaction(callback: (transaction: unknown) => Promise<unknown>) { return callback(this); },
    applicationCase: {
      async findFirst() { return { id: 'application-1', status: 'DRAFT' as const }; },
      async update() { return {}; },
    },
    user: {
      async findUnique() { return { planCode: 'ALPHA' }; },
      async updateMany() { return { count: 0 }; },
    },
    analysisRun: { async count() { return 0; }, async create() { runCreated = true; return {}; } },
  };
  const service = new ApplicationsService(database as never, { async enqueueInitialAnalysis() { return 'job'; } } as never);

  await assert.rejects(
    service.launchInitialAnalysisForUser('user-1', 'application-1'),
    (error: unknown) => error instanceof AnalysisQuotaExceededException,
  );
  assert.equal(runCreated, false);
});

test('releases a reserved unit when the analysis queue is unavailable', async () => {
  let releasedUsage: unknown;
  const database = {
    async $transaction(callbackOrOperations: unknown) {
      if (typeof callbackOrOperations === 'function') return callbackOrOperations(this);
      return Promise.all(callbackOrOperations as Promise<unknown>[]);
    },
    applicationCase: {
      async findFirst() { return { id: 'application-1', status: 'DRAFT' as const }; },
      async update() { return {}; },
    },
    user: {
      async findUnique() { return { planCode: 'ALPHA' }; },
      async updateMany() { return { count: 1 }; },
      async update(arguments_: unknown) { releasedUsage = arguments_; return {}; },
    },
    analysisRun: {
      async count() { return 0; },
      async create() {
        return {
          id: 'run-1', applicationCaseId: 'application-1', workflowType: 'INITIAL_ANALYSIS' as const,
          status: 'QUEUED' as const, currentStage: null, errorCode: null, createdAt, updatedAt: createdAt,
        };
      },
      async update() { return {}; },
    },
  };
  const service = new ApplicationsService(database as never, {
    async enqueueInitialAnalysis() { throw new Error('queue unavailable'); },
  } as never);

  await assert.rejects(service.launchInitialAnalysisForUser('user-1', 'application-1'));
  assert.deepEqual(releasedUsage, {
    where: { id: 'user-1' },
    data: { initialAnalysisUnitsUsed: { decrement: 1 } },
  });
});

test('does not start analysis for another users vacancy', async () => {
  let findArguments: unknown;
  const database = {
    async $transaction(callback: (transaction: unknown) => Promise<unknown>) {
      return callback(this);
    },
    applicationCase: {
      async findFirst(arguments_: unknown) {
        findArguments = arguments_;
        return null;
      },
    },
  };
  const service = new ApplicationsService(database as never, {} as never);

  await assert.rejects(
    service.launchInitialAnalysisForUser('user-2', 'application-1'),
    (error: unknown) => error instanceof NotFoundException,
  );
  assert.deepEqual(findArguments, {
    where: { id: 'application-1', userId: 'user-2' },
    select: { id: true, status: true },
  });
});

test('returns a run status only when its vacancy belongs to the user', async () => {
  let findArguments: unknown;
  const database = {
    analysisRun: {
      async findFirst(arguments_: unknown) {
        findArguments = arguments_;
        return {
          id: 'run-1',
          applicationCaseId: 'application-1',
          workflowType: 'INITIAL_ANALYSIS' as const,
          status: 'FAILED' as const,
          currentStage: null,
          errorCode: 'WORKFLOW_FAILED',
          createdAt,
          updatedAt: createdAt,
        };
      },
    },
  };
  const service = new ApplicationsService(database as never);

  const result = await service.getInitialAnalysisRunForUser('user-1', 'application-1', 'run-1');

  assert.deepEqual(result, {
    id: 'run-1',
    applicationCaseId: 'application-1',
    workflowType: 'INITIAL_ANALYSIS',
    status: 'FAILED',
    currentStage: null,
    errorCode: 'WORKFLOW_FAILED',
    createdAt: '2026-08-03T18:00:00.000Z',
    updatedAt: '2026-08-03T18:00:00.000Z',
  });
  assert.deepEqual(findArguments, {
    where: {
      id: 'run-1',
      applicationCaseId: 'application-1',
      workflowType: 'INITIAL_ANALYSIS',
      applicationCase: { userId: 'user-1' },
    },
    select: {
      id: true,
      applicationCaseId: true,
      workflowType: true,
      status: true,
      currentStage: true,
      errorCode: true,
      createdAt: true,
      updatedAt: true,
    },
  });
});

test('does not return a run from another user or vacancy', async () => {
  const database = {
    analysisRun: {
      async findFirst() {
        return null;
      },
    },
  };
  const service = new ApplicationsService(database as never);

  await assert.rejects(
    service.getInitialAnalysisRunForUser('user-2', 'application-1', 'run-1'),
    (error: unknown) => error instanceof NotFoundException,
  );
});

test('returns completed initial analysis markdown only to the vacancy owner', async () => {
  let findArguments: unknown;
  const database = {
    analysisRun: {
      async findFirst(arguments_: unknown) {
        findArguments = arguments_;
        return {
          id: 'run-1',
          applicationCaseId: 'application-1',
          status: 'SUCCEEDED' as const,
          finalMarkdown: '# Итоговый отчёт',
          editedFinalMarkdown: null,
        };
      },
    },
  };
  const service = new ApplicationsService(database as never);

  const result = await service.getInitialAnalysisResultForUser('user-1', 'application-1', 'run-1');

  assert.deepEqual(result, {
    id: 'run-1',
    applicationCaseId: 'application-1',
    finalMarkdown: '# Итоговый отчёт',
    editedFinalMarkdown: null,
  });
  assert.deepEqual(findArguments, {
    where: {
      id: 'run-1',
      applicationCaseId: 'application-1',
      workflowType: 'INITIAL_ANALYSIS',
      applicationCase: { userId: 'user-1' },
    },
    select: {
      id: true,
      applicationCaseId: true,
      status: true,
      finalMarkdown: true,
      editedFinalMarkdown: true,
    },
  });
});

test('does not return an incomplete or foreign initial analysis result', async () => {
  const incompleteDatabase = {
    analysisRun: {
      async findFirst() {
        return {
          id: 'run-1',
          applicationCaseId: 'application-1',
          status: 'RUNNING' as const,
          finalMarkdown: null,
          editedFinalMarkdown: null,
        };
      },
    },
  };
  const missingDatabase = {
    analysisRun: {
      async findFirst() {
        return null;
      },
    },
  };

  await assert.rejects(
    new ApplicationsService(incompleteDatabase as never).getInitialAnalysisResultForUser(
      'user-1',
      'application-1',
      'run-1',
    ),
    (error: unknown) => error instanceof BadRequestException,
  );
  await assert.rejects(
    new ApplicationsService(missingDatabase as never).getInitialAnalysisResultForUser(
      'user-2',
      'application-1',
      'run-1',
    ),
    (error: unknown) => error instanceof NotFoundException,
  );
});

test('stores an edited full report without changing the generated report', async () => {
  let updateArguments: unknown;
  const database = {
    analysisRun: {
      async findFirst() {
        return {
          id: 'run-1',
          applicationCaseId: 'application-1',
          status: 'SUCCEEDED' as const,
          finalMarkdown: '# AI report',
          editedFinalMarkdown: null,
        };
      },
      async update(arguments_: unknown) {
        updateArguments = arguments_;
        return {
          id: 'run-1',
          applicationCaseId: 'application-1',
          status: 'SUCCEEDED' as const,
          finalMarkdown: '# AI report',
          editedFinalMarkdown: '# My report',
        };
      },
    },
  };

  const result = await new ApplicationsService(database as never).updateInitialAnalysisResultForUser(
    'user-1', 'application-1', 'run-1', { editedFinalMarkdown: '# My report' },
  );

  assert.deepEqual(result, {
    id: 'run-1',
    applicationCaseId: 'application-1',
    finalMarkdown: '# AI report',
    editedFinalMarkdown: '# My report',
  });
  assert.deepEqual(updateArguments, {
    where: { id: 'run-1' },
    data: { editedFinalMarkdown: '# My report' },
    select: {
      id: true,
      applicationCaseId: true,
      status: true,
      finalMarkdown: true,
      editedFinalMarkdown: true,
    },
  });
});

test('does not edit a full report outside the vacancy owner scope', async () => {
  const database = { analysisRun: { async findFirst() { return null; } } };

  await assert.rejects(
    new ApplicationsService(database as never).updateInitialAnalysisResultForUser(
      'user-2', 'application-1', 'run-1', { editedFinalMarkdown: '# My report' },
    ),
    (error: unknown) => error instanceof NotFoundException,
  );
});

test('resets only the edited full report to the generated report', async () => {
  let updateArguments: unknown;
  const database = {
    analysisRun: {
      async findFirst() {
        return {
          id: 'run-1',
          applicationCaseId: 'application-1',
          status: 'SUCCEEDED' as const,
          finalMarkdown: '# AI report',
          editedFinalMarkdown: '# My report',
        };
      },
      async update(arguments_: unknown) {
        updateArguments = arguments_;
        return {
          id: 'run-1',
          applicationCaseId: 'application-1',
          status: 'SUCCEEDED' as const,
          finalMarkdown: '# AI report',
          editedFinalMarkdown: null,
        };
      },
    },
  };

  const result = await new ApplicationsService(database as never).resetInitialAnalysisResultForUser(
    'user-1', 'application-1', 'run-1',
  );

  assert.equal(result.finalMarkdown, '# AI report');
  assert.equal(result.editedFinalMarkdown, null);
  assert.deepEqual(updateArguments, {
    where: { id: 'run-1' },
    data: { editedFinalMarkdown: null },
    select: {
      id: true,
      applicationCaseId: true,
      status: true,
      finalMarkdown: true,
      editedFinalMarkdown: true,
    },
  });
});

test('lists artifacts only for the vacancy owner', async () => {
  const database = {
    applicationCase: { async findFirst() { return { id: 'application-1' }; } },
    artifact: { async findMany() { return [{ id: 'artifact-1', applicationCaseId: 'application-1', type: 'COVER_LETTER' as const, generatedContent: 'Письмо', editedContent: null, updatedAt: createdAt }]; } },
  };
  const result = await new ApplicationsService(database as never).getArtifactsForUser('user-1', 'application-1');
  assert.equal(result[0]?.generatedContent, 'Письмо');

  const missing = { applicationCase: { async findFirst() { return null; } } };
  await assert.rejects(
    new ApplicationsService(missing as never).getArtifactsForUser('user-2', 'application-1'),
    (error: unknown) => error instanceof NotFoundException,
  );
});

test('stores an edited artifact version without changing the generated version', async () => {
  let updateArguments: unknown;
  const database = {
    artifact: {
      async findFirst() { return { id: 'artifact-1' }; },
      async update(arguments_: unknown) {
        updateArguments = arguments_;
        return {
          id: 'artifact-1', applicationCaseId: 'application-1', type: 'COVER_LETTER' as const,
          generatedContent: 'AI version', editedContent: 'Edited version', updatedAt: createdAt,
        };
      },
    },
  };

  const result = await new ApplicationsService(database as never).updateArtifactForUser(
    'user-1', 'application-1', 'artifact-1', { editedContent: 'Edited version' },
  );

  assert.equal(result.generatedContent, 'AI version');
  assert.equal(result.editedContent, 'Edited version');
  assert.deepEqual(updateArguments, {
    where: { id: 'artifact-1' },
    data: { editedContent: 'Edited version' },
    select: { id: true, applicationCaseId: true, type: true, generatedContent: true, editedContent: true, updatedAt: true },
  });
});

test('does not update an artifact outside the user vacancy', async () => {
  const database = { artifact: { async findFirst() { return null; } } };

  await assert.rejects(
    new ApplicationsService(database as never).updateArtifactForUser(
      'user-2', 'application-1', 'artifact-1', { editedContent: 'Edited version' },
    ),
    (error: unknown) => error instanceof NotFoundException,
  );
});

test('resets only the edited artifact version to its AI version', async () => {
  let updateArguments: unknown;
  const database = {
    artifact: {
      async findFirst() { return { id: 'artifact-1' }; },
      async update(arguments_: unknown) {
        updateArguments = arguments_;
        return {
          id: 'artifact-1', applicationCaseId: 'application-1', type: 'COVER_LETTER' as const,
          generatedContent: 'AI version', editedContent: null, updatedAt: createdAt,
        };
      },
    },
  };

  const result = await new ApplicationsService(database as never).resetArtifactToGeneratedContentForUser(
    'user-1', 'application-1', 'artifact-1',
  );

  assert.equal(result.generatedContent, 'AI version');
  assert.equal(result.editedContent, null);
  assert.deepEqual(updateArguments, {
    where: { id: 'artifact-1' },
    data: { editedContent: null },
    select: { id: true, applicationCaseId: true, type: true, generatedContent: true, editedContent: true, updatedAt: true },
  });
});

test('does not reset an artifact outside the user vacancy', async () => {
  const database = { artifact: { async findFirst() { return null; } } };

  await assert.rejects(
    new ApplicationsService(database as never).resetArtifactToGeneratedContentForUser(
      'user-2', 'application-1', 'artifact-1',
    ),
    (error: unknown) => error instanceof NotFoundException,
  );
});
