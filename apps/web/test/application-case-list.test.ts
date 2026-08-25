import assert from 'node:assert/strict';
import test from 'node:test';

import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import { ApplicationCaseList } from '../src/features/applications/ApplicationCaseList.js';

const updatedAt = '2026-08-13T12:00:00.000Z';
const callbacks = {
  onOpenAnalysis: () => undefined,
  onRetryAnalysis: () => undefined,
  onUpdateStatus: () => undefined,
  onDelete: () => undefined,
};

test('shows only queued and running initial analyses on the analysis page', () => {
  const markup = renderToStaticMarkup(createElement(ApplicationCaseList, {
    applicationCases: [
      { id: 'queued', title: 'Queued role', status: 'IN_PROGRESS', currentStage: 'IN_PROGRESS', createdAt: updatedAt, updatedAt, analysisRun: { id: 'run-queued', applicationCaseId: 'queued', workflowType: 'INITIAL_ANALYSIS', status: 'QUEUED', currentStage: null, errorCode: null, manualRetryCount: 0, createdAt: updatedAt, updatedAt }, hrPreparationRun: null, postInterviewRun: null },
      { id: 'ready', title: 'Ready role', status: 'OFFER', currentStage: 'IN_PROGRESS', createdAt: updatedAt, updatedAt, analysisRun: { id: 'run-ready', applicationCaseId: 'ready', workflowType: 'INITIAL_ANALYSIS', status: 'SUCCEEDED', currentStage: null, errorCode: null, manualRetryCount: 0, createdAt: updatedAt, updatedAt }, hrPreparationRun: null, postInterviewRun: null },
    ],
    scope: 'active',
    ...callbacks,
  }));

  assert.match(markup, /Анализы в работе/);
  assert.match(markup, /Queued role/);
  assert.doesNotMatch(markup, /Ready role/);
  assert.doesNotMatch(markup, /Фильтр статуса вакансии/);
});

test('keeps every case in history and exposes only the three user-facing states', () => {
  const markup = renderToStaticMarkup(createElement(ApplicationCaseList, {
    applicationCases: [
      { id: 'failed', title: 'Failed role', status: 'IN_PROGRESS', currentStage: 'IN_PROGRESS', createdAt: updatedAt, updatedAt, analysisRun: { id: 'run-failed', applicationCaseId: 'failed', workflowType: 'INITIAL_ANALYSIS', status: 'FAILED', currentStage: null, errorCode: 'ANALYST_RESPONSE_INVALID', manualRetryCount: 0, createdAt: updatedAt, updatedAt }, hrPreparationRun: null, postInterviewRun: null },
      { id: 'offer', title: 'Offer role', status: 'OFFER', currentStage: 'IN_PROGRESS', createdAt: updatedAt, updatedAt, analysisRun: { id: 'run-offer', applicationCaseId: 'offer', workflowType: 'INITIAL_ANALYSIS', status: 'SUCCEEDED', currentStage: null, errorCode: null, manualRetryCount: 0, createdAt: updatedAt, updatedAt }, hrPreparationRun: null, postInterviewRun: null },
    ],
    scope: 'history',
    ...callbacks,
  }));

  assert.match(markup, /Failed role/);
  assert.match(markup, /Offer role/);
  assert.match(markup, /Повторить анализ/);
  assert.match(markup, /Фильтр статуса вакансии/);
  assert.match(markup, /В процессе/);
  assert.match(markup, /Отказ/);
  assert.match(markup, /Оффер/);
  assert.doesNotMatch(markup, /Архивировать/);
  assert.doesNotMatch(markup, /Изменить статус/);
});
