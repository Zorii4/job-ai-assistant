import assert from 'node:assert/strict';
import test from 'node:test';

import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import { ApplicationCaseList } from '../src/features/applications/ApplicationCaseList.js';

const updatedAt = '2026-08-13T12:00:00.000Z';

test('renders server-restored active, completed and failed analysis snapshots', () => {
  const markup = renderToStaticMarkup(
    createElement(ApplicationCaseList, {
      applicationCases: [
        { id: 'application-queued', title: 'Queued role', status: 'ANALYZING', currentStage: 'ANALYZING', createdAt: updatedAt, updatedAt, analysisRun: { id: 'run-queued', applicationCaseId: 'application-queued', workflowType: 'INITIAL_ANALYSIS', status: 'QUEUED', currentStage: null, errorCode: null, createdAt: updatedAt, updatedAt } },
        { id: 'application-ready', title: 'Ready role', status: 'ANALYSIS_READY', currentStage: 'ANALYSIS_READY', createdAt: updatedAt, updatedAt, analysisRun: { id: 'run-ready', applicationCaseId: 'application-ready', workflowType: 'INITIAL_ANALYSIS', status: 'SUCCEEDED', currentStage: null, errorCode: null, createdAt: updatedAt, updatedAt } },
        { id: 'application-failed', title: 'Failed role', status: 'FAILED', currentStage: 'FAILED', createdAt: updatedAt, updatedAt, analysisRun: { id: 'run-failed', applicationCaseId: 'application-failed', workflowType: 'INITIAL_ANALYSIS', status: 'FAILED', currentStage: null, errorCode: 'ANALYST_RESPONSE_INVALID', createdAt: updatedAt, updatedAt } },
      ],
      onOpenAnalysis: () => undefined,
      onRetryAnalysis: () => undefined,
      onUpdateStage: () => undefined,
      retryingApplicationCaseId: null,
      updatingApplicationCaseId: null,
    }),
  );

  assert.match(markup, /В процессе/);
  assert.match(markup, /Готовые результаты/);
  assert.match(markup, /Другие вакансии/);
  assert.match(markup, /Queued role/);
  assert.match(markup, /Ready role/);
  assert.match(markup, /Failed role/);
  assert.match(markup, /К результату/);
  assert.match(markup, /Сбой на этапе анализа соответствия/);
  assert.match(markup, /Повторить анализ/);
  assert.match(markup, /Идёт первоначальный анализ/);
  assert.match(markup, /Анализ готов/);
  assert.match(markup, /Анализ требует внимания/);
  assert.match(markup, /Создано:/);
  assert.match(markup, /Обновлено:/);
  assert.match(markup, /Отклик отправлен/);
  assert.match(markup, /Фильтр статуса/);
  assert.match(markup, /Изменить статус/);
});
