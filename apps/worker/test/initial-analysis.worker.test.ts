import assert from 'node:assert/strict';
import test from 'node:test';

import {
  extractInitialArtifacts,
  processInitialAnalysisJob,
  removeUngroundedCandidateIdentity,
} from '../src/initial-analysis.worker.js';
import { recoverCompletedInitialAnalysisRuns, recoverInterruptedInitialAnalysisRuns } from '../src/main.js';

test('extracts the complete known material set from final markdown', () => {
  const markdown = [
    '### Блоки для резюме',
    '',
    '- Усилить опыт',
    '',
    '### Готовые тексты',
    '',
    '#### Сопроводительное письмо',
    '',
    'Письмо',
    '',
    '#### Сообщение рекрутеру',
    '',
    'Сообщение',
    '',
    '#### Follow-up',
    '',
    'Напоминание',
  ].join('\n');

  assert.deepEqual(extractInitialArtifacts(markdown), [
    { type: 'RESUME_RECOMMENDATIONS', generatedContent: '- Усилить опыт' },
    { type: 'COVER_LETTER', generatedContent: 'Письмо' },
    { type: 'RECRUITER_MESSAGE', generatedContent: 'Сообщение' },
    { type: 'FOLLOW_UP', generatedContent: 'Напоминание' },
  ]);
});

test('falls back to the full report when a known material section is absent', () => {
  assert.equal(extractInitialArtifacts('### Блоки для резюме\n\n- Усилить опыт'), null);
});

test('removes invented candidate identities from the recruiter message only', () => {
  const markdown = [
    '### Готовые тексты',
    '',
    '#### Сообщение рекрутеру',
    '',
    'Здравствуйте! Меня зовут Сергей Зайцев. Я Frontend-разработчик с опытом Vue.',
    '',
    '#### Follow-up',
    '',
    'Добрый день!',
  ].join('\n');

  assert.equal(
    removeUngroundedCandidateIdentity(markdown),
    [
      '### Готовые тексты',
      '',
      '#### Сообщение рекрутеру',
      '',
      'Здравствуйте! Я Frontend-разработчик с опытом Vue.',
      '',
      '#### Follow-up',
      '',
      'Добрый день!',
    ].join('\n'),
  );
});

test('loads only sanitized snapshots from the database before running initial analysis', async () => {
  const queries: Array<{ text: string; values: readonly unknown[] }> = [];
  let receivedInput: unknown;
  const database = {
    async query(text: string, values: readonly unknown[]) {
      queries.push({ text, values });

      if (text.startsWith('UPDATE analysis_run AS run')) {
        return {
          rows: [{
            userId: 'user-1',
            resumeSanitizedText: '[EMAIL_1] опыт',
            vacancySanitizedText: 'Node.js developer',
          }],
        };
      }

      return { rows: [] };
    },
  };

  await processInitialAnalysisJob(
    { applicationCaseId: 'application-1', analysisRunId: 'run-1' },
    {
      database,
      retryRemaining: false,
      async runInitialAnalysis(input) {
        receivedInput = input;
        await input.onProgress({ stage: 'producer' });
        return { finalMarkdown: '# Готово' };
      },
    },
  );

  assert.deepEqual(receivedInput, {
    resumeText: '[EMAIL_1] опыт',
    vacancyText: 'Node.js developer',
    source: 'web',
    userId: 'user-1',
    onProgress: (receivedInput as { onProgress: unknown }).onProgress,
  });
  assert.equal(
    queries.some((query) => query.values.includes('source resume') || query.values.includes('source vacancy')),
    false,
  );
  assert.equal(
    queries.some((query) => query.values.includes('[EMAIL_1] опыт') || query.values.includes('Node.js developer')),
    false,
  );
  assert.equal(queries[0]?.text.includes("SET status = 'RUNNING'"), true);
  assert.equal(queries[0]?.values[0], 'run-1');
  assert.equal(queries.some((query) => query.values[0] === 'producer' && query.values[1] === 'run-1'), true);
  assert.equal(queries.some((query) => query.text.includes("SET status = 'SUCCEEDED'") && query.values[1] === 'run-1'), true);
  assert.equal(queries.some((query) => query.text.includes("SET status = 'ANALYSIS_READY'")), false);
  assert.equal(queries.some((query) => query.text.includes('WITH completed_run AS')), false);
});

test('finalizes an already generated report without calling the LLM again', async () => {
  const queries: Array<{ text: string; values: readonly unknown[] }> = [];
  let workflowCalls = 0;
  const database = {
    async query(text: string, values: readonly unknown[]) {
      queries.push({ text, values });

      if (text.startsWith('UPDATE analysis_run AS run')) {
        return {
          rows: [{
            userId: 'user-1',
            resumeSanitizedText: 'Resume',
            vacancySanitizedText: 'Vacancy',
            existingFinalMarkdown: '# Completed report',
          }],
        };
      }

      return { rows: [] };
    },
  };

  await processInitialAnalysisJob(
    { applicationCaseId: 'application-1', analysisRunId: 'run-1' },
    {
      database,
      retryRemaining: false,
      async runInitialAnalysis() {
        workflowCalls += 1;
        return { finalMarkdown: '# Unexpected rerun' };
      },
    },
  );

  assert.equal(workflowCalls, 0);
  assert.equal(
    queries.some((query) => query.text.includes("SET status = 'SUCCEEDED'") && query.values[0] === '# Completed report'),
    true,
  );
  assert.equal(queries.some((query) => query.text.includes("SET status = 'ANALYSIS_READY'")), false);
});

test('marks a workflow failure terminally without storing raw errors or requeuing the full analysis', async () => {
  const queries: Array<{ text: string; values: readonly unknown[] }> = [];
  const database = {
    async query(text: string, values: readonly unknown[]) {
      queries.push({ text, values });

      if (text.startsWith('UPDATE analysis_run AS run')) {
        return {
          rows: [{
            userId: 'user-1',
            resumeSanitizedText: '[EMAIL_1] опыт',
            vacancySanitizedText: 'Node.js developer',
          }],
        };
      }

      return { rows: [] };
    },
  };

  await processInitialAnalysisJob(
    { applicationCaseId: 'application-1', analysisRunId: 'run-1' },
    {
      database,
      retryRemaining: true,
      async runInitialAnalysis() {
        throw Object.assign(new Error('private provider error'), {
          llmErrorCode: 'LLM_RESPONSE_INVALID',
          stepName: 'analyst',
        });
      },
    },
  );

  assert.equal(queries.some((query) => query.values.includes('private provider error')), false);
  assert.equal(queries.some((query) => query.values.includes('WORKFLOW_RETRY')), false);
  assert.equal(queries.some((query) => query.values[0] === 'run-1' && query.values[1] === 'ANALYST_RESPONSE_INVALID'), true);
  assert.equal(queries.some((query) => query.text.includes('UPDATE application_case') && query.text.includes("SET status = 'FAILED'")), false);
  assert.equal(queries.some((query) => query.text.includes('INSERT INTO stage_event') && query.values[0] === 'application-1'), false);
  const quotaReleases = queries.filter(
    (query) => query.text.includes('initialAnalysisUnitsUsed') && query.values[0] === 'application-1',
  );
  assert.equal(quotaReleases.length, 1);
  assert.match(quotaReleases[0]?.text ?? '', /GREATEST\(account\."initialAnalysisUnitsUsed" - 1, 0\)/);
});

test('requeues a timed out Analyst while preserving the checkpoint and quota', async () => {
  const queries: Array<{ text: string; values: readonly unknown[] }> = [];
  const database = {
    async query(text: string, values: readonly unknown[]) {
      queries.push({ text, values });

      if (text.startsWith('UPDATE analysis_run AS run')) {
        return {
          rows: [{
            userId: 'user-1',
            resumeSanitizedText: '[EMAIL_1] опыт',
            vacancySanitizedText: 'Node.js developer',
          }],
        };
      }

      return { rows: [] };
    },
  };

  await assert.rejects(
    processInitialAnalysisJob(
      { applicationCaseId: 'application-1', analysisRunId: 'run-1' },
      {
        database,
        retryRemaining: true,
        async runInitialAnalysis() {
          throw Object.assign(new Error('provider timeout'), {
            llmErrorCode: 'LLM_TIMEOUT',
          stepName: 'analyst',
          });
        },
      },
    ),
    /initial_analysis_transient_retry/,
  );

  assert.equal(queries.some((query) => query.text.includes("SET status = 'QUEUED'") && query.values.includes('WORKFLOW_RETRY')), true);
  assert.equal(queries.some((query) => query.text.includes("SET status = 'FAILED'")), false);
  assert.equal(queries.some((query) => query.text.includes('initialAnalysisUnitsUsed')), false);
});

test('requeues an invalid Critic response while preserving the checkpoint and quota', async () => {
  const queries: Array<{ text: string; values: readonly unknown[] }> = [];
  const database = {
    async query(text: string, values: readonly unknown[]) {
      queries.push({ text, values });

      if (text.startsWith('UPDATE analysis_run AS run')) {
        return {
          rows: [{
            userId: 'user-1',
            resumeSanitizedText: '[EMAIL_1] experience',
            vacancySanitizedText: 'Node.js developer',
          }],
        };
      }

      return { rows: [] };
    },
  };

  await assert.rejects(
    processInitialAnalysisJob(
      { applicationCaseId: 'application-1', analysisRunId: 'run-1' },
      {
        database,
        retryRemaining: true,
        async runInitialAnalysis() {
          throw Object.assign(new Error('invalid structured response'), {
            llmErrorCode: 'LLM_RESPONSE_INVALID',
            stepName: 'critic.v2',
          });
        },
      },
    ),
    /initial_analysis_transient_retry/,
  );

  assert.equal(queries.some((query) => query.text.includes("SET status = 'QUEUED'") && query.values.includes('WORKFLOW_RETRY')), true);
  assert.equal(queries.some((query) => query.text.includes("SET status = 'FAILED'")), false);
  assert.equal(queries.some((query) => query.text.includes('initialAnalysisUnitsUsed')), false);
});

test('allows PgBoss to retry a persistence error after a completed workflow', async () => {
  const queries: Array<{ text: string; values: readonly unknown[] }> = [];
  const database = {
    async query(text: string, values: readonly unknown[]) {
      queries.push({ text, values });

      if (text.startsWith('UPDATE analysis_run AS run')) {
        return {
          rows: [{
            userId: 'user-1',
            resumeSanitizedText: '[EMAIL_1] опыт',
            vacancySanitizedText: 'Node.js developer',
          }],
        };
      }

      if (text.includes("SET status = 'SUCCEEDED'")) {
        throw new Error('database write failed');
      }

      return { rows: [] };
    },
  };

  await assert.rejects(
    processInitialAnalysisJob(
      { applicationCaseId: 'application-1', analysisRunId: 'run-1' },
      {
        database,
        retryRemaining: true,
        async runInitialAnalysis() {
          return { finalMarkdown: '# Готово' };
        },
      },
    ),
    /initial_analysis_failed/,
  );

  assert.equal(queries.some((query) => query.text.includes("status = 'QUEUED'")), true);
});

test('does not execute the workflow twice when the queue delivers the same completed job again', async () => {
  let claimCount = 0;
  let workflowCalls = 0;
  const artifactInserts: Array<readonly unknown[]> = [];
  const database = {
    async query(text: string, values: readonly unknown[]) {
      if (text.startsWith('UPDATE analysis_run AS run')) {
        claimCount += 1;
        return {
          rows: claimCount === 1
            ? [{ userId: 'user-1', resumeSanitizedText: 'Resume', vacancySanitizedText: 'Vacancy' }]
            : [],
        };
      }

      if (text.startsWith('INSERT INTO artifact')) {
        assert.match(text, /INSERT INTO artifact \(id,/);
        artifactInserts.push(values);
      }
      return { rows: [] };
    },
  };
  const dependencies = {
    database,
    retryRemaining: false,
    async runInitialAnalysis() {
      workflowCalls += 1;
      return {
        finalMarkdown: [
          '### Блоки для резюме', '', 'Рекомендации', '', '### Готовые тексты', '',
          '#### Сопроводительное письмо', '', 'Письмо', '', '#### Сообщение рекрутеру', '',
          'Сообщение', '', '#### Follow-up', '', 'Напоминание',
        ].join('\n'),
      };
    },
  };

  await processInitialAnalysisJob({ applicationCaseId: 'application-1', analysisRunId: 'run-1' }, dependencies);
  await processInitialAnalysisJob({ applicationCaseId: 'application-1', analysisRunId: 'run-1' }, dependencies);

  assert.equal(workflowCalls, 1);
  assert.equal(artifactInserts.length, 4);
});

test('requeues interrupted initial-analysis runs when the single worker restarts', async () => {
  const queries: Array<{ text: string; values: readonly unknown[] | undefined }> = [];
  const recovered = await recoverInterruptedInitialAnalysisRuns({
    async query(text: string, values?: readonly unknown[]) {
      queries.push({ text, values });
      return { rows: [{ applicationCaseId: 'application-1', analysisRunId: 'run-1' }] };
    },
  } as never);

  assert.deepEqual(recovered, [{ applicationCaseId: 'application-1', analysisRunId: 'run-1' }]);
  assert.match(queries[0]?.text ?? '', /status = 'RUNNING'/);
  assert.match(queries[0]?.text ?? '', /status = 'QUEUED'/);
});

test('recovers completed reports that failed only during result persistence', async () => {
  const queries: Array<{ text: string; values: readonly unknown[] | undefined }> = [];
  const recovered = await recoverCompletedInitialAnalysisRuns({
    async query(text: string, values?: readonly unknown[]) {
      queries.push({ text, values });
      return { rows: [{ applicationCaseId: 'application-1', analysisRunId: 'run-1' }] };
    },
  } as never);

  assert.deepEqual(recovered, [{ applicationCaseId: 'application-1', analysisRunId: 'run-1' }]);
  assert.match(queries[0]?.text ?? '', /"finalMarkdown" IS NOT NULL/);
  assert.match(queries[0]?.text ?? '', /status IN \('FAILED', 'QUEUED'\)/);
  assert.match(queries[0]?.text ?? '', /application\.status = 'IN_PROGRESS'/);
  assert.match(queries[0]?.text ?? '', /SET status = 'QUEUED', "currentStage" = 'final'/);
});
