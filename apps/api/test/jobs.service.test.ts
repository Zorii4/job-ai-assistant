import assert from 'node:assert/strict';
import test from 'node:test';

import { InitialAnalysisJobPayloadSchema } from '@job-ai-assistant/contracts';

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
