import assert from 'node:assert/strict';
import test from 'node:test';

import { createAnalyzePostInterview } from '../src/app/analyzePostInterview.js';

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
