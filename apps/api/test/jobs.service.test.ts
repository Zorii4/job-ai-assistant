import assert from 'node:assert/strict';
import test from 'node:test';

import { HRPreparationJobPayloadSchema, InitialAnalysisJobPayloadSchema } from '@job-ai-assistant/contracts';

test('initial analysis job payload contains only stable entity identifiers', () => {
  const payload = {
    applicationCaseId: 'application-1',
    analysisRunId: 'run-1',
  };

  assert.equal(InitialAnalysisJobPayloadSchema.safeParse(payload).success, true);
  assert.equal(
    InitialAnalysisJobPayloadSchema.safeParse({ ...payload, vacancyText: 'private text' }).success,
    false,
  );
  assert.equal(
    InitialAnalysisJobPayloadSchema.safeParse({ ...payload, resumeText: 'private text' }).success,
    false,
  );
});

test('HR preparation job payload contains only stable entity identifiers', () => {
  const payload = {
    applicationCaseId: 'application-1',
    analysisRunId: 'run-hr-1',
  };

  assert.equal(HRPreparationJobPayloadSchema.safeParse(payload).success, true);
  assert.equal(
    HRPreparationJobPayloadSchema.safeParse({ ...payload, finalMarkdown: 'private result' }).success,
    false,
  );
  assert.equal(
    HRPreparationJobPayloadSchema.safeParse({ ...payload, resumeText: 'private text' }).success,
    false,
  );
});
