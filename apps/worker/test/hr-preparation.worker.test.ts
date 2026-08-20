import assert from 'node:assert/strict';
import test from 'node:test';

import { formatHRPreparationMaterial, processHRPreparationJob } from '../src/hr-preparation.worker.js';

const result = {
  schemaVersion: '1' as const,
  items: Array.from({ length: 5 }, (_, index) => ({
    question: `Как вы расскажете о релевантном опыте ${index + 1}?`,
    answer: `Я опираюсь на подтверждённый опыт и спокойно поясню его связь с ролью ${index + 1}.`,
  })),
};

test('loads only saved snapshots and persists one HR preparation artifact', async () => {
  const queries: Array<{ text: string; values: readonly unknown[] }> = [];
  let receivedInput: unknown;
  const database = {
    async query(text: string, values: readonly unknown[]) {
      queries.push({ text, values });
      if (text.startsWith('UPDATE analysis_run AS run')) {
        return {
          rows: [{
            resumeSanitizedSnapshot: '[EMAIL_1] подтверждённый опыт',
            vacancyTextSnapshot: 'Вакансия Node.js developer',
            initialAnalysisFinalMarkdown: '# Initial analysis',
          }],
        };
      }

      return { rows: [] };
    },
  };

  await processHRPreparationJob(
    { applicationCaseId: 'application-1', analysisRunId: 'run-hr-1' },
    {
      database,
      retryRemaining: false,
      async prepareForHrScreening(input) {
        receivedInput = input;
        return { result, promptVersion: '1' };
      },
    },
  );

  assert.deepEqual(receivedInput, {
    resumeSanitizedSnapshot: '[EMAIL_1] подтверждённый опыт',
    vacancyTextSnapshot: 'Вакансия Node.js developer',
    initialAnalysisFinalMarkdown: '# Initial analysis',
  });
  assert.equal(queries[0]?.text.includes('"resumeSanitizedText"'), true);
  assert.equal(queries[0]?.text.includes('"vacancySanitizedText"'), true);
  assert.equal(queries[0]?.text.includes('"finalMarkdown"'), true);
  assert.equal(queries[0]?.text.includes('sourceText'), false);
  assert.equal(queries.some((query) => query.text.includes("'HR_SCREENING_PREPARATION'")), true);
  assert.equal(queries.some((query) => query.text.includes("SET status = 'SUCCEEDED'") && query.values.includes('1')), true);
  assert.equal(queries.some((query) => query.text.includes("SET status = 'HR_PREPARATION_READY'")), true);
  assert.equal(queries.some((query) => query.text.includes('INSERT INTO stage_event')), true);
});

test('does not run HR preparation unless an invited case has a successful initial analysis', async () => {
  let calls = 0;
  const database = {
    async query() {
      return { rows: [] };
    },
  };

  await processHRPreparationJob(
    { applicationCaseId: 'application-1', analysisRunId: 'run-hr-1' },
    {
      database,
      retryRemaining: false,
      async prepareForHrScreening() {
        calls += 1;
        return { result, promptVersion: '1' };
      },
    },
  );

  assert.equal(calls, 0);
});

test('stores a safe terminal error without persisting the raw LLM error', async () => {
  const queries: Array<{ text: string; values: readonly unknown[] }> = [];
  const database = {
    async query(text: string, values: readonly unknown[]) {
      queries.push({ text, values });
      if (text.startsWith('UPDATE analysis_run AS run')) {
        return {
          rows: [{
            resumeSanitizedSnapshot: '[EMAIL_1] опыт',
            vacancyTextSnapshot: 'Вакансия',
            initialAnalysisFinalMarkdown: '# Initial analysis',
          }],
        };
      }

      return { rows: [] };
    },
  };

  await processHRPreparationJob(
    { applicationCaseId: 'application-1', analysisRunId: 'run-hr-1' },
    {
      database,
      retryRemaining: false,
      async prepareForHrScreening() {
        throw new Error('private provider network error for candidate');
      },
    },
  );

  assert.equal(queries.some((query) => query.values.includes('private provider network error for candidate')), false);
  assert.equal(queries.some((query) => query.values.includes('HR_PREPARATION_NETWORK_ERROR')), true);
  assert.equal(queries.some((query) => query.text.includes("HR_PREPARATION_READY")), false);
});

test('formats the structured result as a read-only Markdown material', () => {
  const markdown = formatHRPreparationMaterial(result);

  assert.match(markdown, /^## Подготовка к HR-скринингу/m);
  assert.match(markdown, /### 1\. Как вы расскажете о релевантном опыте 1\?/);
  assert.match(markdown, /подтверждённый опыт/);
});
