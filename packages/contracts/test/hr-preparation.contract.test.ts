import assert from 'node:assert/strict';
import test from 'node:test';

import { HRPreparationJobPayloadSchema, HRPreparationResultSchema } from '../src/index.js';

const validItems = Array.from({ length: 5 }, (_, index) => ({
  question: `Вероятный вопрос HR ${index + 1}?`,
  answer: `Краткий рекомендуемый ответ кандидата для вопроса ${index + 1}.`,
}));

test('accepts an HR preparation result with 5 to 10 question-answer pairs', () => {
  const result = HRPreparationResultSchema.parse({
    schemaVersion: '1',
    items: validItems,
  });

  assert.equal(result.items.length, 5);
  assert.equal(result.items[0]?.question, 'Вероятный вопрос HR 1?');
});

test('rejects unsupported schema versions and unexpected fields', () => {
  assert.equal(
    HRPreparationResultSchema.safeParse({ schemaVersion: '2', items: validItems }).success,
    false,
  );
  assert.equal(
    HRPreparationResultSchema.safeParse({
      schemaVersion: '1',
      items: validItems,
      summary: 'Лишнее поле',
    }).success,
    false,
  );
});

test('requires between 5 and 10 items', () => {
  assert.equal(
    HRPreparationResultSchema.safeParse({ schemaVersion: '1', items: validItems.slice(0, 4) }).success,
    false,
  );
  assert.equal(
    HRPreparationResultSchema.safeParse({
      schemaVersion: '1',
      items: Array.from({ length: 11 }, (_, index) => ({
        question: `Вероятный вопрос HR ${index + 1}?`,
        answer: `Краткий рекомендуемый ответ кандидата для вопроса ${index + 1}.`,
      })),
    }).success,
    false,
  );
});

test('rejects missing, blank, oversized, and unexpected item fields', () => {
  const invalidItems = [
    { question: ' ', answer: 'Достаточно длинный ответ кандидата.' },
    { question: 'Коротко?', answer: 'Достаточно длинный ответ кандидата.' },
    { question: 'Достаточно длинный вопрос?', answer: ' ' },
    { question: 'Достаточно длинный вопрос?', answer: 'Коротко.' },
    { question: 'Достаточно длинный вопрос?', answer: 'a'.repeat(2_001) },
    { question: 'Достаточно длинный вопрос?', answer: 'Достаточно длинный ответ кандидата.', confidence: 1 },
  ];

  for (const invalidItem of invalidItems) {
    assert.equal(
      HRPreparationResultSchema.safeParse({
        schemaVersion: '1',
        items: [invalidItem, ...validItems.slice(1)],
      }).success,
      false,
    );
  }
});

test('accepts an ID-only HR preparation job payload', () => {
  assert.equal(
    HRPreparationJobPayloadSchema.safeParse({
      applicationCaseId: 'application-1',
      analysisRunId: 'run-1',
    }).success,
    true,
  );
  assert.equal(
    HRPreparationJobPayloadSchema.safeParse({
      applicationCaseId: 'application-1',
      analysisRunId: 'run-1',
      resumeText: 'Запрещённый текст',
    }).success,
    false,
  );
});
