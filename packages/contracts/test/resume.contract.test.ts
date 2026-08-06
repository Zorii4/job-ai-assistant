import assert from 'node:assert/strict';
import test from 'node:test';

import {
  CreateResumeFileRequestSchema,
  ResumeDetailResponseSchema,
  ResumeListResponseSchema,
  ResumeResponseSchema,
  UpdateSanitizedResumeRequestSchema,
  ApplicationCaseResponseSchema,
  InitialAnalysisResultResponseSchema,
  AnalysisRunResponseSchema,
  CreateApplicationCaseFileRequestSchema,
  UpdateArtifactRequestSchema,
  API_SCHEMA_VERSION,
  ResumeSourceTypeSchema,
  VacancySourceTypeSchema,
} from '../src/index.js';

test('allows only file sources for resumes and vacancies', () => {
  assert.equal(ResumeSourceTypeSchema.safeParse('FILE').success, true);
  assert.equal(ResumeSourceTypeSchema.safeParse('TEXT').success, false);
  assert.equal(VacancySourceTypeSchema.safeParse('FILE').success, true);
  assert.equal(VacancySourceTypeSchema.safeParse('TEXT').success, false);
});

test('validates a manually edited sanitized resume', () => {
  assert.equal(
    UpdateSanitizedResumeRequestSchema.safeParse({ sanitizedText: 'Подтверждённый текст' }).success,
    true,
  );
  assert.equal(UpdateSanitizedResumeRequestSchema.safeParse({ sanitizedText: '  ' }).success, false);
});

test('accepts an edited artifact but rejects blank or unexpected content', () => {
  assert.equal(UpdateArtifactRequestSchema.safeParse({ editedContent: 'Моя версия письма' }).success, true);
  assert.equal(UpdateArtifactRequestSchema.safeParse({ editedContent: '  ' }).success, false);
  assert.equal(
    UpdateArtifactRequestSchema.safeParse({ editedContent: 'Моя версия', generatedContent: 'AI version' }).success,
    false,
  );
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
      sourceType: 'FILE',
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
