import assert from 'node:assert/strict';
import test from 'node:test';

import { sanitizeDirectIdentifiers } from '../src/resumes/resume-sanitizer.js';

test('replaces direct identifiers with stable placeholders', () => {
  const result = sanitizeDirectIdentifiers(
    'Контакт: alex@example.test, +7 (999) 123-45-67. Профиль: linkedin.com/in/alex-test. Повтор: ALEX@example.test.',
  );

  assert.equal(
    result.sanitizedText,
    'Контакт: [EMAIL_1], [PHONE_1]. Профиль: [PROFILE_URL_1]. Повтор: [EMAIL_1].',
  );
});

test('normalizes Russian phone formats to one placeholder', () => {
  const result = sanitizeDirectIdentifiers('8 999 123-45-67; +7 999 123 45 67');

  assert.equal(result.sanitizedText, '[PHONE_1]; [PHONE_1]');
});

test('does not replace a regular website that is not a personal profile', () => {
  const result = sanitizeDirectIdentifiers('Проект: https://example.test/product');

  assert.equal(result.sanitizedText, 'Проект: https://example.test/product');
});

test('replaces labelled employers and educational institutions, including a repeated employer mention', () => {
  const result = sanitizeDirectIdentifiers(
    'Компания: Example Systems\nУниверситет: Example State University\nОпыт в Example Systems помог развить навыки.',
  );

  assert.equal(
    result.sanitizedText,
    'Компания: [EMPLOYER_1]\nУниверситет: [EDUCATION_1]\nОпыт в [EMPLOYER_1] помог развить навыки.',
  );
});

test('keeps unlabelled employer and university mentions for user review', () => {
  const result = sanitizeDirectIdentifiers(
    'Example Systems — компания разработки. Example State University — образование.',
  );

  assert.equal(
    result.sanitizedText,
    'Example Systems — компания разработки. Example State University — образование.',
  );
});

test('preserves Markdown headings, lists, tables and section order while sanitizing identifiers', () => {
  const sourceText = [
    '# Опыт работы',
    '',
    '- Компания: ООО Пример',
    '- Email: candidate@example.test',
    '',
    '## Навыки',
    '',
    '| Год | Роль |',
    '| --- | --- |',
    '| 2025 | Backend developer |',
  ].join('\n');

  assert.equal(
    sanitizeDirectIdentifiers(sourceText).sanitizedText,
    [
      '# Опыт работы',
      '',
      '- Компания: [EMPLOYER_1]',
      '- Email: [EMAIL_1]',
      '',
      '## Навыки',
      '',
      '| Год | Роль |',
      '| --- | --- |',
      '| 2025 | Backend developer |',
    ].join('\n'),
  );
});

test('replaces a labelled employer in a Markdown table and its repeated mention', () => {
  const result = sanitizeDirectIdentifiers(
    '| Период | Компания | Роль |\n| --- | --- | --- |\n| 2023–2025 | Компания: Северный Контур | Engineer |\n\nОпыт в Северный Контур помог развить навыки.',
  );

  assert.equal(
    result.sanitizedText,
    '| Период | Компания | Роль |\n| --- | --- | --- |\n| 2023–2025 | Компания: [EMPLOYER_1] | Engineer |\n\nОпыт в [EMPLOYER_1] помог развить навыки.',
  );
});

test('keeps stable replacements for company legal forms, groups and repeated work-history mentions', () => {
  const result = sanitizeDirectIdentifiers(
    'Работодатель: ООО Северный Контур\nОрганизация: Северный Контур Group\n\nОпыт работы: ООО Северный Контур — backend engineer.\nПовторное упоминание Северный Контур Group — mentor.',
  );

  assert.equal(
    result.sanitizedText,
    'Работодатель: [EMPLOYER_1]\nОрганизация: [EMPLOYER_2]\n\nОпыт работы: [EMPLOYER_1] — backend engineer.\nПовторное упоминание [EMPLOYER_2] — mentor.',
  );
});

test('preserves Markdown link, quote and code-block syntax while replacing personal identifiers', () => {
  const sourceText = [
    '# Контакты',
    '',
    '[Портфолио](https://github.com/candidate-profile)',
    '',
    '> Email: candidate@example.test',
    '',
    '```text',
    'Связаться: candidate@example.test',
    '```',
  ].join('\n');

  assert.equal(
    sanitizeDirectIdentifiers(sourceText).sanitizedText,
    [
      '# Контакты',
      '',
      '[Портфолио]([PROFILE_URL_1])',
      '',
      '> Email: [EMAIL_1]',
      '',
      '```text',
      'Связаться: [EMAIL_1]',
      '```',
    ].join('\n'),
  );
});
