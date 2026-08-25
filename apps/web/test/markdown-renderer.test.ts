import assert from 'node:assert/strict';
import test from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import { MarkdownReport } from '../src/features/resumes/AnalysisOutput';

test('renders CommonMark and GFM structure without executing raw HTML', () => {
  const html = renderToStaticMarkup(createElement(MarkdownReport, {
    markdown: [
      '# Заголовок',
      '',
      'Обычный **текст** и [ссылка](https://example.com).',
      '',
      '| Роль | Статус |',
      '| --- | --- |',
      '| Аналитик | Готово |',
      '',
      '<script>window.__unsafe = true</script>',
    ].join('\n'),
  }));

  assert.match(html, /<h1>Заголовок<\/h1>/);
  assert.match(html, /<strong>текст<\/strong>/);
  assert.match(html, /<table>/);
  assert.match(html, /href="https:\/\/example.com"/);
  assert.doesNotMatch(html, /<script\b/i);
  assert.doesNotMatch(html, /window\.__unsafe/);
});
