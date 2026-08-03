import assert from 'node:assert/strict';
import test from 'node:test';

import { BadRequestException } from '@nestjs/common';

import {
  extractUploadedVacancyFile,
  filterVacancyUpload,
} from '../src/applications/vacancy-file.js';

test('extracts a UTF-8 TXT vacancy and clears the original upload buffer', async () => {
  const buffer = Buffer.from('Node.js developer', 'utf8');

  const result = await extractUploadedVacancyFile({
    originalname: 'vacancy.txt',
    mimetype: 'text/plain',
    size: buffer.length,
    buffer,
  });

  assert.deepEqual(result, { sourceFileName: 'vacancy.txt', sourceText: 'Node.js developer' });
  assert.equal(buffer.every((value) => value === 0), true);
});

test('rejects unsupported vacancy upload metadata before extraction', () => {
  let accepted: boolean | undefined;

  filterVacancyUpload({}, { originalname: 'vacancy.exe', mimetype: 'application/octet-stream' }, (_error, value) => {
    accepted = value;
  });

  assert.equal(accepted, false);
});

test('rejects malformed vacancy text uploads and clears the buffer', async () => {
  const buffer = Buffer.from([0xff]);

  await assert.rejects(
    extractUploadedVacancyFile({
      originalname: 'vacancy.txt',
      mimetype: 'text/plain',
      size: buffer.length,
      buffer,
    }),
    (error: unknown) => error instanceof BadRequestException,
  );
  assert.equal(buffer.every((value) => value === 0), true);
});
