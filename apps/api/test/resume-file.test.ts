import assert from 'node:assert/strict';
import test from 'node:test';

import { BadRequestException } from '@nestjs/common';

import {
  extractUploadedResumeFile,
  filterResumeUpload,
  type UploadedResumeFile,
} from '../src/resumes/resume-file.js';

function createUpload(overrides: Partial<UploadedResumeFile> = {}): UploadedResumeFile {
  const buffer = Buffer.from('Опыт работы и навыки', 'utf8');

  return {
    originalname: 'resume.txt',
    mimetype: 'text/plain',
    size: buffer.length,
    buffer,
    ...overrides,
  };
}

test('extracts a UTF-8 TXT resume and clears the original upload buffer', async () => {
  const file = createUpload({ originalname: 'C:\\fake-path\\resume.txt' });

  const result = await extractUploadedResumeFile(file);

  assert.deepEqual(result, {
    sourceFileName: 'resume.txt',
    sourceText: 'Опыт работы и навыки',
  });
  assert.equal(file.buffer.every((byte) => byte === 0), true);
});

test('preserves Markdown source structure during file extraction', async () => {
  const markdown = '# Опыт\n\n- TypeScript\n- NestJS\n\n| Год | Роль |\n| --- | --- |\n| 2025 | Backend developer |';
  const file = createUpload({
    originalname: 'resume.md',
    mimetype: 'text/markdown',
    buffer: Buffer.from(markdown, 'utf8'),
    size: Buffer.byteLength(markdown),
  });

  const result = await extractUploadedResumeFile(file);

  assert.equal(result.sourceText, markdown);
  assert.equal(file.buffer.every((byte) => byte === 0), true);
});

test('rejects a file with an unsupported MIME type before extraction', () => {
  let accepted: boolean | undefined;
  filterResumeUpload(
    undefined,
    { originalname: 'resume.txt', mimetype: 'application/octet-stream' },
    (error, acceptFile) => {
      assert.equal(error, null);
      accepted = acceptFile;
    },
  );

  assert.equal(accepted, false);
});

test('accepts supported PDF, MD and TXT MIME and extension pairs', () => {
  for (const [originalname, mimetype] of [
    ['resume.pdf', 'application/pdf'],
    ['resume.md', 'text/markdown'],
    ['resume.txt', 'text/plain'],
  ]) {
    let accepted: boolean | undefined;
    filterResumeUpload(undefined, { originalname, mimetype }, (_error, acceptFile) => {
      accepted = acceptFile;
    });
    assert.equal(accepted, true);
  }
});

test('rejects a malformed text upload and clears its buffer', async () => {
  const file = createUpload({
    buffer: Buffer.from([0xc3, 0x28]),
    size: 2,
  });

  await assert.rejects(
    extractUploadedResumeFile(file),
    (error: unknown) => error instanceof BadRequestException,
  );
  assert.equal(file.buffer.every((byte) => byte === 0), true);
});

test('rejects a damaged PDF and clears its buffer', async () => {
  const file = createUpload({
    originalname: 'resume.pdf',
    mimetype: 'application/pdf',
    buffer: Buffer.from('not a PDF', 'utf8'),
    size: 9,
  });

  await assert.rejects(
    extractUploadedResumeFile(file),
    (error: unknown) => error instanceof BadRequestException,
  );
  assert.equal(file.buffer.every((byte) => byte === 0), true);
});
