import assert from 'node:assert/strict';
import test from 'node:test';

import { getFileValidationError } from '../src/components/FileUpload.js';

test('accepts a supported file within the client-side size limit', () => {
  assert.equal(getFileValidationError({ name: 'resume.pdf', type: 'application/pdf', size: 1024 }), null);
});

test('rejects unsupported, empty and oversized files before upload', () => {
  assert.equal(getFileValidationError({ name: 'resume.docx', type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', size: 1024 }), 'Выберите файл PDF, MD или TXT.');
  assert.equal(getFileValidationError({ name: 'resume.txt', type: 'text/plain', size: 0 }), 'Выбранный файл пуст. Выберите другой файл.');
  assert.equal(getFileValidationError({ name: 'resume.txt', type: 'text/plain', size: 10 * 1024 * 1024 + 1 }), 'Размер файла не должен превышать 10 МБ.');
});
