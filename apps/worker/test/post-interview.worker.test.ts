import assert from 'node:assert/strict';
import test from 'node:test';

import { processPostInterviewJob } from '../src/post-interview.worker.js';

const result = {
  schemaVersion: '1' as const,
  analysisMarkdown: '## Разбор\n\nПрямого подтверждения следующего этапа нет.',
  hrClosingMessage: 'Спасибо за обратную связь. Буду признателен за информацию о дальнейших шагах.',
};

test('loads only permitted saved inputs and atomically persists both post-interview artifacts', async () => {
  const queries: Array<{ text: string; values: readonly unknown[] }> = [];
  let receivedInput: unknown;
  const database = {
    async query(text: string, values: readonly unknown[]) {
      queries.push({ text, values });
      if (text.startsWith('UPDATE analysis_run AS run')) {
        return {
          rows: [{
            sanitizedHrMessage: 'Вернёмся с ответом. [EMAIL_1]',
            vacancyTextSnapshot: 'Вакансия Node.js developer',
            initialAnalysisFinalMarkdown: '# Initial analysis',
          }],
        };
      }

      return { rows: [] };
    },
  };

  await processPostInterviewJob(
    { applicationCaseId: 'application-1', analysisRunId: 'run-post-1' },
    {
      database,
      retryRemaining: false,
      async analyzePostInterview(input) {
        receivedInput = input;
        return { result, promptVersion: '1' };
      },
    },
  );

  assert.deepEqual(receivedInput, {
    sanitizedHrMessage: 'Вернёмся с ответом. [EMAIL_1]',
    vacancyTextSnapshot: 'Вакансия Node.js developer',
    initialAnalysisFinalMarkdown: '# Initial analysis',
  });
  assert.equal(queries[0]?.text.includes('post_interview_input'), true);
  assert.equal(queries[0]?.text.includes('resumeSanitizedText'), false);
  assert.equal(queries.some((query) => query.text.includes("'POST_INTERVIEW_REVIEW'")), true);
  assert.equal(queries.some((query) => query.text.includes("'HR_CLOSING_MESSAGE'")), true);
  assert.equal(queries.some((query) => query.text.includes("SET status = 'SUCCEEDED'")), true);
});

test('stores a safe terminal error without persisting the raw LLM error', async () => {
  const queries: Array<{ text: string; values: readonly unknown[] }> = [];
  const database = {
    async query(text: string, values: readonly unknown[]) {
      queries.push({ text, values });
      if (text.startsWith('UPDATE analysis_run AS run')) {
        return { rows: [{ sanitizedHrMessage: 'Сообщение', vacancyTextSnapshot: 'Вакансия', initialAnalysisFinalMarkdown: '# Initial analysis' }] };
      }

      return { rows: [] };
    },
  };

  await processPostInterviewJob(
    { applicationCaseId: 'application-1', analysisRunId: 'run-post-1' },
    {
      database,
      retryRemaining: false,
      async analyzePostInterview() {
        throw new Error('private provider network error for HR message');
      },
    },
  );

  assert.equal(queries.some((query) => query.values.includes('private provider network error for HR message')), false);
  assert.equal(queries.some((query) => query.values.includes('POST_INTERVIEW_NETWORK_ERROR')), true);
});
