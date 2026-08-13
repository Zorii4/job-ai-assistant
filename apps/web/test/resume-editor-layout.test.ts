import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const resumeLibrary = readFileSync(new URL('../src/features/resumes/ResumeLibrary.tsx', import.meta.url), 'utf8');
const styles = readFileSync(new URL('../src/style.css', import.meta.url), 'utf8');

test('keeps stored line breaks separate from visual wrapping in the resume editor', () => {
  const syntheticResume = 'https://example.test/very-long-profile-path-without-any-natural-break-points\n| Период | Достижение |\n| --- | --- |\n| 2026 | TypeScript / российский-английский-текст |';

  assert.match(syntheticResume, /\n/);
  assert.match(resumeLibrary, /wrap="soft"/);
  assert.match(styles, /\.preview-editor textarea\s*\{[\s\S]*white-space: pre-wrap;/);
});

test('allows long URL, table and mixed-language text to wrap at desktop and responsive widths', () => {
  assert.match(styles, /\.preview-editor textarea\s*\{[\s\S]*min-width: 0;/);
  assert.match(styles, /\.preview-editor textarea\s*\{[\s\S]*max-width: 100%;/);
  assert.match(styles, /\.preview-editor textarea\s*\{[\s\S]*overflow-wrap: anywhere;/);
  assert.match(styles, /\.preview-editor textarea\s*\{[\s\S]*word-break: break-word;/);
});
