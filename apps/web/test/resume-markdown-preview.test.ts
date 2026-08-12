import assert from 'node:assert/strict';
import test from 'node:test';

import { parseResumeMarkdown } from '../src/features/resumes/ResumeMarkdownPreview.js';

test('keeps supported Markdown structure and renders unknown markup as text', () => {
  assert.deepEqual(parseResumeMarkdown('# Опыт\n\n- TypeScript\n- NestJS\n\n| Год | Роль |\n| --- | --- |\n| 2025 | Developer |\n\n<script>alert(1)</script>'), [
    { type: 'heading', level: 1, text: 'Опыт' },
    { type: 'list', items: ['TypeScript', 'NestJS'] },
    { type: 'table', rows: [['Год', 'Роль'], ['2025', 'Developer']] },
    { type: 'paragraph', text: '<script>alert(1)</script>' },
  ]);
});

test('preserves the source order of supported blocks for accessible editing and preview', () => {
  assert.deepEqual(
    parseResumeMarkdown('## Опыт\n\n- TypeScript\n\n| Год | Роль |\n| --- | --- |\n| 2025 | Developer |\n\n## Навыки\n\nNestJS'),
    [
      { type: 'heading', level: 2, text: 'Опыт' },
      { type: 'list', items: ['TypeScript'] },
      { type: 'table', rows: [['Год', 'Роль'], ['2025', 'Developer']] },
      { type: 'heading', level: 2, text: 'Навыки' },
      { type: 'paragraph', text: 'NestJS' },
    ],
  );
});

test('keeps quotes, code blocks and links as safe source content', () => {
  assert.deepEqual(parseResumeMarkdown('> Проверить [источник](https://example.test)\n\n```\nconst value = 1;\n```'), [
    { type: 'quote', text: 'Проверить [источник](https://example.test)' },
    { type: 'code', text: 'const value = 1;' },
  ]);
});
