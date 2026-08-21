import assert from 'node:assert/strict';
import test from 'node:test';

import {
  CreatePostInterviewRequestSchema,
  PostInterviewJobPayloadSchema,
  PostInterviewMessageMaxLength,
  PostInterviewResultSchema,
} from '../src/index.js';

test('accepts the minimal post-interview structured result', () => {
  const result = PostInterviewResultSchema.parse({
    schemaVersion: '1',
    analysisMarkdown: '## Разбор\n\nФактов для вывода недостаточно.',
    hrClosingMessage: 'Спасибо за обратную связь.',
  });

  assert.equal(result.schemaVersion, '1');
});

test('rejects incomplete and unexpected post-interview results', () => {
  assert.equal(PostInterviewResultSchema.safeParse({ schemaVersion: '1', analysisMarkdown: 'Разбор' }).success, false);
  assert.equal(PostInterviewResultSchema.safeParse({ schemaVersion: '1', analysisMarkdown: ' ', hrClosingMessage: 'Сообщение' }).success, false);
  assert.equal(PostInterviewResultSchema.safeParse({ schemaVersion: '1', analysisMarkdown: 'Разбор', hrClosingMessage: 'Сообщение', extra: true }).success, false);
});

test('limits the submitted HR message to 8000 characters', () => {
  assert.equal(CreatePostInterviewRequestSchema.safeParse({ hrMessage: 'x'.repeat(PostInterviewMessageMaxLength) }).success, true);
  assert.equal(CreatePostInterviewRequestSchema.safeParse({ hrMessage: 'x'.repeat(PostInterviewMessageMaxLength + 1) }).success, false);
});

test('accepts only identifier-only post-interview jobs', () => {
  assert.equal(PostInterviewJobPayloadSchema.safeParse({ applicationCaseId: 'application-1', analysisRunId: 'run-1' }).success, true);
  assert.equal(PostInterviewJobPayloadSchema.safeParse({ applicationCaseId: 'application-1', analysisRunId: 'run-1', hrMessage: 'Private text' }).success, false);
});
