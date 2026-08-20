import assert from 'node:assert/strict';
import test from 'node:test';

import { createPrepareForHrScreening } from '../src/app/prepareForHrScreening.js';

const result = {
  schemaVersion: '1' as const,
  items: Array.from({ length: 5 }, (_, index) => ({
    question: `Как вы расскажете о релевантном опыте ${index + 1}?`,
    answer: `Я опираюсь на подтверждённый опыт и спокойно поясню его связь с ролью ${index + 1}.`,
  })),
};

test('HR preparation makes one structured call with the three persisted snapshots', async () => {
  let receivedSystemPrompt: string | undefined;
  let receivedUserPrompt: string | undefined;
  const prepareForHrScreening = createPrepareForHrScreening({
    async loadPromptBundle() {
      return { systemPrompt: 'private prompt is injected in production', promptVersion: '1' };
    },
    async call(systemPrompt, userPrompt) {
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
