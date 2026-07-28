import assert from 'node:assert/strict';
import test from 'node:test';

import {
  CreateResumeRequestSchema,
  CreateResumeFileRequestSchema,
  ResumeDetailResponseSchema,
  ResumeListResponseSchema,
  ResumeResponseSchema,
  UpdateSanitizedResumeRequestSchema,
  API_SCHEMA_VERSION,
} from '../src/index.js';

test('accepts a valid text resume draft request', () => {
  const result = CreateResumeRequestSchema.safeParse({
    title: 'Frontend resume',
    sourceText: 'Опыт работы и навыки',
  });

  assert.equal(result.success, true);
});

test('validates a manually edited sanitized resume', () => {
  assert.equal(
    UpdateSanitizedResumeRequestSchema.safeParse({ sanitizedText: 'Подтверждённый текст' }).success,
    true,
  );
  assert.equal(UpdateSanitizedResumeRequestSchema.safeParse({ sanitizedText: '  ' }).success, false);
});

test('rejects an invalid text resume draft request', () => {
  const result = CreateResumeRequestSchema.safeParse({
    title: '',
    sourceText: 'Опыт работы и навыки',
    unexpected: true,
  });

  assert.equal(result.success, false);
});

test('accepts a title for a resume file draft', () => {
  assert.equal(
    CreateResumeFileRequestSchema.safeParse({ title: 'Frontend resume' }).success,
    true,
  );
  assert.equal(CreateResumeFileRequestSchema.safeParse({ title: '', fileName: 'cv.txt' }).success, false);
});

test('resume responses never include source text', () => {
  const baseResponse = {
    schemaVersion: API_SCHEMA_VERSION,
    resume: {
      id: 'resume-1',
      title: 'Frontend resume',
      sourceType: 'TEXT',
      sanitizationStatus: 'PENDING_REVIEW',
      confirmedAt: null,
      createdAt: '2026-07-28T12:00:00.000Z',
      updatedAt: '2026-07-28T12:00:00.000Z',
    },
  };

  assert.equal(ResumeResponseSchema.safeParse(baseResponse).success, true);
  assert.equal(
    ResumeResponseSchema.safeParse({
      ...baseResponse,
      resume: { ...baseResponse.resume, sourceText: 'private source text' },
    }).success,
    false,
  );
  assert.equal(
    ResumeListResponseSchema.safeParse({
      schemaVersion: API_SCHEMA_VERSION,
      resumes: [baseResponse.resume],
    }).success,
    true,
  );

  assert.equal(
    ResumeDetailResponseSchema.safeParse({
      schemaVersion: API_SCHEMA_VERSION,
      resume: {
        ...baseResponse.resume,
        sanitizedText: '[EMAIL_1] Опыт работы',
        sanitizationVersion: 'resume-sanitization-v3',
      },
    }).success,
    true,
  );
});
