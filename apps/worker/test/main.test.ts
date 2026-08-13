import assert from 'node:assert/strict';
import test from 'node:test';

import { initialAnalysisWorkerOptions } from '../src/main.js';

test('limits one worker process to two concurrent initial analysis jobs', () => {
  assert.deepEqual(initialAnalysisWorkerOptions, {
    includeMetadata: true,
    batchSize: 1,
    localConcurrency: 2,
  });
});
