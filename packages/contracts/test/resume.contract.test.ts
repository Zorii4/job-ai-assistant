import assert from 'node:assert/strict';
import test from 'node:test';

import {
  CreateResumeRequestSchema,
  CreateResumeFileRequestSchema,
  ResumeDetailResponseSchema,
  ResumeListResponseSchema,
  ResumeResponseSchema,
  UpdateSanitizedResumeRequestSchema,
  ApplicationCaseResponseSchema,
  InitialAnalysisResultResponseSchema,
  AnalysisRunResponseSchema,
  CreateApplicationCaseRequestSchema,
  CreateApplicationCaseFileRequestSchema,
  UpdateArtifactRequestSchema,
  API_SCHEMA_VERSION,
} from '../src/index.js';

test('accepts a valid text resume draft request', () => {
  const result = CreateResumeRequestSchema.safeParse({
    title: 'Frontend resume',
    sourceText: 'Опыт работы и навыки',
  });

  assert.equal(result.success, true);
});

test('accepts a text vacancy draft request and keeps its public response text-free', () => {
  assert.equal(
    CreateApplicationCaseRequestSchema.safeParse({
      title: 'Backend developer',
      resumeId: 'resume-1',
      vacancyText: 'Node.js developer',
    }).success,
    true,
  );

  const response = {
    schemaVersion: API_SCHEMA_VERSION,
    applicationCase: {
      id: 'application-1',
      title: 'Backend developer',
      resumeId: 'resume-1',
      vacancySourceType: 'TEXT',
      status: 'DRAFT',
      currentStage: 'DRAFT',
      createdAt: '2026-08-03T18:00:00.000Z',
      updatedAt: '2026-08-03T18:00:00.000Z',
    },
  };

  assert.equal(ApplicationCaseResponseSchema.safeParse(response).success, true);
  assert.equal(
    AnalysisRunResponseSchema.safeParse({
      schemaVersion: API_SCHEMA_VERSION,
      analysisRun: {
        id: 'run-1',
        applicationCaseId: 'application-1',
        workflowType: 'INITIAL_ANALYSIS',
        status: 'QUEUED',
        currentStage: null,
        errorCode: null,
        createdAt: '2026-08-03T18:00:00.000Z',
        updatedAt: '2026-08-03T18:00:00.000Z',
      },
    }).success,
    true,
  );
  assert.equal(
    InitialAnalysisResultResponseSchema.safeParse({
      schemaVersion: API_SCHEMA_VERSION,
      analysisResult: {
        id: 'run-1',
        applicationCaseId: 'application-1',
        finalMarkdown: '# Итоговый отчёт',
      },
    }).success,
    true,
  );
  assert.equal(
    CreateApplicationCaseFileRequestSchema.safeParse({ title: 'Backend developer', resumeId: 'resume-1' }).success,
    true,
  );
  assert.equal(
    ApplicationCaseResponseSchema.safeParse({
      ...response,
      applicationCase: { ...response.applicationCase, vacancySourceText: 'private vacancy text' },
    }).success,
    false,
  );
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
