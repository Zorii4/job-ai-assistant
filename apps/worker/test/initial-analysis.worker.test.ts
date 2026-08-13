import assert from 'node:assert/strict';
import test from 'node:test';

import { extractInitialArtifacts, processInitialAnalysisJob } from '../src/initial-analysis.worker.js';

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
  assert.equal(queries.some((query) => query.text.includes("SET status = 'ANALYSIS_READY'") && query.values[0] === 'application-1'), true);
  assert.deepEqual(queries.at(-1)?.values, ['application-1']);
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
        throw new Error('private provider error');
      },
    },
  );

  assert.equal(queries.some((query) => query.values.includes('private provider error')), false);
  assert.equal(queries.some((query) => query.values.includes('WORKFLOW_RETRY')), false);
  assert.deepEqual(queries.at(-3)?.values, ['run-1']);
  assert.deepEqual(queries.at(-2)?.values, ['application-1']);
  assert.deepEqual(queries.at(-1)?.values, ['application-1']);
  assert.match(queries.at(-1)?.text ?? '', /initialAnalysisUnitsUsed/);
});

test('allows PgBoss to retry a persistence error after a completed workflow', async () => {
  const queries: Array<{ text: string; values: readonly unknown[] }> = [];
  let callCount = 0;
  const database = {
    async query(text: string, values: readonly unknown[]) {
      queries.push({ text, values });
      callCount += 1;

      if (text.startsWith('UPDATE analysis_run AS run')) {
        return {
          rows: [{
            userId: 'user-1',
            resumeSanitizedText: '[EMAIL_1] опыт',
            vacancySanitizedText: 'Node.js developer',
          }],
        };
      }

      if (callCount === 3) {
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
