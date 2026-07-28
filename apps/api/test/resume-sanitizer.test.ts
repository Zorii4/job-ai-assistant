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

test('replaces employers and educational institutions only in explicitly labelled lines', () => {
  const result = sanitizeDirectIdentifiers(
    'Компания: Example Systems\nУниверситет: Example State University\nОпыт в Example Systems помог развить навыки.',
  );

  assert.equal(
    result.sanitizedText,
    'Компания: [EMPLOYER_1]\nУниверситет: [EDUCATION_1]\nОпыт в Example Systems помог развить навыки.',
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
