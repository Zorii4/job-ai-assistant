import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createPostInterviewLlmOptions,
  createAnalyzePostInterview,
  resolvePostInterviewMaxOutputTokens,
  resolvePostInterviewModel,
} from '../src/app/analyzePostInterview.js';

const result = {
  schemaVersion: '1' as const,
  analysisMarkdown: '## Разбор\n\nПрямого подтверждения следующего этапа нет.',
  hrClosingMessage: 'Спасибо за обратную связь. Буду признателен за информацию о дальнейших шагах.',
};

test('post-interview makes one structured call with only the approved three inputs', async () => {
  let receivedSystemPrompt: string | undefined;
  let receivedUserPrompt: string | undefined;
  const analyzePostInterview = createAnalyzePostInterview({
    async loadPromptBundle() {
      return { systemPrompt: 'private prompt is injected in production', promptVersion: '1' };
    },
    async call(systemPrompt, userPrompt) {
      receivedSystemPrompt = systemPrompt;
      receivedUserPrompt = userPrompt;
      return { data: result };
    },
  });

  const output = await analyzePostInterview({
    sanitizedHrMessage: 'Спасибо за интервью. Вернёмся с ответом.',
    vacancyTextSnapshot: 'Вакансия Node.js developer',
    initialAnalysisFinalMarkdown: '# Initial analysis',
  });

  assert.equal(receivedSystemPrompt, 'private prompt is injected in production');
  assert.deepEqual(JSON.parse(receivedUserPrompt ?? ''), {
    schemaVersion: '1',
    sanitizedHrMessage: 'Спасибо за интервью. Вернёмся с ответом.',
    vacancyTextSnapshot: 'Вакансия Node.js developer',
    initialAnalysisFinalMarkdown: '# Initial analysis',
  });
  assert.equal(receivedUserPrompt?.includes('resumeSanitizedSnapshot'), false);
  assert.equal(receivedUserPrompt?.includes('HR_SCREENING_PREPARATION'), false);
  assert.equal(output.promptVersion, '1');
});

test('post-interview uses a 5000-token default and accepts an explicit positive limit', () => {
  assert.equal(resolvePostInterviewMaxOutputTokens(undefined), 5_000);
  assert.equal(resolvePostInterviewMaxOutputTokens('6500'), 6_500);
  assert.equal(resolvePostInterviewMaxOutputTokens('invalid'), 5_000);
});

test('post-interview pins the approved model independently from the main workflow model', () => {
  assert.equal(resolvePostInterviewModel(undefined), 'deepseek-v4-flash-0731');
  assert.equal(resolvePostInterviewModel(' deepseek-v4-flash-0731 '), 'deepseek-v4-flash-0731');
});

test('post-interview disables both application and provider HTTP retries', () => {
  assert.deepEqual(createPostInterviewLlmOptions('5000', 'deepseek-v4-flash-0731'), {
    timeoutMs: 600_000,
    maxOutputTokens: 5_000,
    transientRetryMaxAttempts: 1,
    providerMaxRetries: 0,
    reasoningEffort: 'low',
    model: 'deepseek-v4-flash-0731',
  });
});
