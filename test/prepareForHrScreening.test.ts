import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createHRPreparationLlmOptions,
  createPrepareForHrScreening,
  resolveHRPreparationMaxOutputTokens,
} from '../src/app/prepareForHrScreening.js';

const result = {
  schemaVersion: '1' as const,
  items: Array.from({ length: 5 }, (_, index) => ({
    question: `Как вы расскажете о релевантном опыте ${index + 1}?`,
    answer: `Я опираюсь на подтверждённый опыт и спокойно поясню его связь с ролью ${index + 1}.`,
  })),
};

test('HR preparation makes one structured call with the three persisted snapshots', async () => {
  let callCount = 0;
  let receivedSystemPrompt: string | undefined;
  let receivedUserPrompt: string | undefined;
  const prepareForHrScreening = createPrepareForHrScreening({
    async loadPromptBundle() {
      return { systemPrompt: 'private prompt is injected in production', promptVersion: '1' };
    },
    async call(systemPrompt, userPrompt) {
      callCount += 1;
      receivedSystemPrompt = systemPrompt;
      receivedUserPrompt = userPrompt;
      return { data: result };
    },
  });

  const output = await prepareForHrScreening({
    resumeSanitizedSnapshot: '[EMAIL_1] подтверждённый опыт',
    vacancyTextSnapshot: 'Вакансия Node.js developer',
    initialAnalysisFinalMarkdown: '# Initial analysis',
  });

  assert.equal(callCount, 1);
  assert.equal(receivedSystemPrompt, 'private prompt is injected in production');
  assert.deepEqual(JSON.parse(receivedUserPrompt ?? ''), {
    schemaVersion: '1',
    resumeSanitizedSnapshot: '[EMAIL_1] подтверждённый опыт',
    vacancyTextSnapshot: 'Вакансия Node.js developer',
    initialAnalysisFinalMarkdown: '# Initial analysis',
  });
  assert.equal(output.promptVersion, '1');
  assert.equal(output.result.items.length, 5);
});

test('HR preparation uses a 5000-token default and accepts an explicit positive limit', () => {
  assert.equal(resolveHRPreparationMaxOutputTokens(undefined), 5_000);
  assert.equal(resolveHRPreparationMaxOutputTokens('6500'), 6_500);
  assert.equal(resolveHRPreparationMaxOutputTokens('invalid'), 5_000);
});

test('HR preparation disables both application and provider HTTP retries', () => {
  assert.deepEqual(createHRPreparationLlmOptions('5000'), {
    timeoutMs: 120_000,
    maxOutputTokens: 5_000,
    transientRetryMaxAttempts: 1,
    providerMaxRetries: 0,
  });
});
