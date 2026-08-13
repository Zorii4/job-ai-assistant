import assert from 'node:assert/strict';
import test from 'node:test';

import { getAnalysisRunStatusLabel, getAnalysisStageLabel, isActiveAnalysisStatus } from '../src/features/analyses/analysisStatus.js';

test('labels analysis statuses and identifies active runs', () => {
  assert.equal(getAnalysisRunStatusLabel('QUEUED'), 'В очереди');
  assert.equal(getAnalysisRunStatusLabel('RUNNING'), 'Выполняется');
  assert.equal(isActiveAnalysisStatus('QUEUED'), true);
  assert.equal(isActiveAnalysisStatus('RUNNING'), true);
  assert.equal(isActiveAnalysisStatus('SUCCEEDED'), false);
  assert.equal(isActiveAnalysisStatus('FAILED'), false);
});

test('labels known analysis stages and handles a future stage safely', () => {
  assert.equal(getAnalysisStageLabel('producer'), 'Подготовка материалов');
  assert.equal(getAnalysisStageLabel('unknown'), 'Выполняем анализ');
});
