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
