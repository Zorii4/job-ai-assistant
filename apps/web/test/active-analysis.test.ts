import assert from 'node:assert/strict';
import test from 'node:test';

import { getAnalysisErrorLabel, getAnalysisRunStatusLabel, getAnalysisStageLabel, isActiveAnalysisStatus } from '../src/features/analyses/analysisStatus.js';

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

test('labels safe terminal analysis errors without exposing provider details', () => {
  assert.equal(getAnalysisErrorLabel('ANALYST_TIMEOUT'), 'Сбой на этапе анализа соответствия.');
  assert.equal(getAnalysisErrorLabel('PRODUCER_NETWORK_ERROR'), 'Сбой на этапе подготовки материалов.');
  assert.equal(getAnalysisErrorLabel('CRITIC_RESPONSE_INVALID'), 'Сбой на этапе проверки материалов.');
  assert.equal(getAnalysisErrorLabel('FINAL_TIMEOUT'), 'Сбой на этапе сборки результата.');
  assert.equal(getAnalysisErrorLabel('PROVIDER_PRIVATE_MESSAGE'), 'Анализ завершился с технической ошибкой.');
});
