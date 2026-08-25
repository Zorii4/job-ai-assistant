import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import { PostInterviewPanel } from '../src/features/analyses/PostInterviewPanel.js';

const analysisResultPage = readFileSync(
  new URL('../src/features/analyses/AnalysisResultPage.tsx', import.meta.url),
  'utf8',
);
const styles = readFileSync(new URL('../src/style.css', import.meta.url), 'utf8');

test('keeps HR and post-interview materials in the user workflow order', () => {
  const hrMaterials = analysisResultPage.indexOf('title="Предполагаемые вопросы от HR и структурированные ответы"');
  const unlockStep = analysisResultPage.indexOf('id="post-interview-unlock-title"');
  const postInterviewForm = analysisResultPage.indexOf('<PostInterviewPanel');
  const postInterviewResult = analysisResultPage.indexOf('title="Разбор сообщения HR"');
  const closingMessage = analysisResultPage.indexOf('title="Закрывающее сообщение HR"');

  assert.ok(hrMaterials >= 0);
  assert.ok(hrMaterials < unlockStep);
  assert.ok(unlockStep < postInterviewForm);
  assert.ok(postInterviewForm < postInterviewResult);
  assert.ok(postInterviewResult < closingMessage);
});

test('keeps the future post-interview form hidden until the HR step is unlocked', () => {
  const sharedProps = {
    applicationCaseId: 'application-1',
    run: null,
    onRunChanged: async () => undefined,
  };

  const hidden = renderToStaticMarkup(createElement(PostInterviewPanel, {
    ...sharedProps,
    isUnlocked: false,
  }));
  const unlocked = renderToStaticMarkup(createElement(PostInterviewPanel, {
    ...sharedProps,
    isUnlocked: true,
  }));

  assert.equal(hidden, '');
  assert.match(unlocked, /Разобрать сообщение HR/);
  assert.match(unlocked, /Сообщение от HR по итогам интервью/);
});

test('keeps workflow sections full-width and copy specific to each material type', () => {
  assert.match(
    styles,
    /\.analysis-report,\s*\.workflow-step,\s*\.post-interview-panel\s*\{[\s\S]*grid-template-columns:\s*minmax\(0,\s*1fr\);/,
  );
  assert.match(analysisResultPage, /Это не материал для отправки работодателю\./);
  assert.match(analysisResultPage, /отредактируйте вне сервиса и отправьте вручную\./);
  assert.doesNotMatch(analysisResultPage, /Выделите и скопируйте нужный фрагмент вручную/);
});
