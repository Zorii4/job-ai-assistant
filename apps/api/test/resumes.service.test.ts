import assert from 'node:assert/strict';
import test from 'node:test';

import { HttpException, NotFoundException } from '@nestjs/common';

import { ResumesService } from '../src/resumes/resumes.service.js';

const firstUserId = 'user-first';
const secondUserId = 'user-second';
const createdAt = new Date('2026-07-28T12:00:00.000Z');

function createRecord(userId: string) {
  return {
    id: 'resume-1',
    title: 'Frontend resume',
    sourceType: 'FILE' as const,
    sanitizationStatus: 'PENDING_REVIEW' as const,
    confirmedAt: null,
    createdAt,
    updatedAt: createdAt,
    userId,
  };
}

function createDetailRecord(userId: string) {
  return {
    ...createRecord(userId),
    sanitizedText: '[EMAIL_1] опыт',
    sanitizationVersion: 'resume-sanitization-v3',
  };
}

test('does not return another users resume', async () => {
  let findArguments: unknown;
  const database = {
    resume: {
      async findFirst(arguments_: unknown) {
        findArguments = arguments_;
        return null;
      },
    },
  };
  const service = new ResumesService(database as never);

  await assert.rejects(
    service.getPreviewForUser(secondUserId, 'resume-1'),
    (error: unknown) => error instanceof NotFoundException,
  );
  assert.deepEqual(findArguments, {
    where: { id: 'resume-1', userId: secondUserId },
    select: {
      id: true,
      title: true,
      sourceType: true,
      sanitizationStatus: true,
      confirmedAt: true,
      createdAt: true,
      updatedAt: true,
      sanitizedText: true,
      sanitizationVersion: true,
    },
  });
});

test('creates a file draft with its safe file name', async () => {
  let createArguments: unknown;
  const database = {
    resume: {
      async findMany() {
        return [];
      },
      async create(arguments_: unknown) {
        createArguments = arguments_;
        return { ...createRecord(firstUserId), sourceType: 'FILE' as const };
      },
    },
  };
  const service = new ResumesService(database as never);

  await service.createFileDraft(
    firstUserId,
    { title: 'Frontend resume' },
    { sourceFileName: 'resume.txt', sourceText: 'private source text' },
  );

  assert.deepEqual(createArguments, {
    data: {
      userId: firstUserId,
      slot: 1,
      title: 'Frontend resume',
      sourceType: 'FILE',
      sourceFileName: 'resume.txt',
      sourceText: 'private source text',
      sanitizedText: 'private source text',
      sanitizationStatus: 'PENDING_REVIEW',
      sanitizationVersion: 'resume-sanitization-v3',
    },
    select: {
      id: true,
      title: true,
      sourceType: true,
      sanitizationStatus: true,
      confirmedAt: true,
      createdAt: true,
      updatedAt: true,
    },
  });
});

test('does not delete another users resume', async () => {
  let deleteArguments: unknown;
  const database = {
    resume: {
      async deleteMany(arguments_: unknown) {
        deleteArguments = arguments_;
        return { count: 0 };
      },
    },
  };
  const service = new ResumesService(database as never);

  await assert.rejects(
    service.deleteForUser(secondUserId, 'resume-1'),
    (error: unknown) => error instanceof NotFoundException,
  );
  assert.deepEqual(deleteArguments, { where: { id: 'resume-1', userId: secondUserId } });
});

test('rejects a sixth resume before creating it', async () => {
  let createCalled = false;
  const database = {
    resume: {
      async findMany() {
        return [{ slot: 1 }, { slot: 2 }, { slot: 3 }, { slot: 4 }, { slot: 5 }];
      },
      async create() {
        createCalled = true;
        return createRecord(firstUserId);
      },
    },
  };
  const service = new ResumesService(database as never);

  await assert.rejects(
    service.createFileDraft(firstUserId, { title: 'Sixth' }, { sourceFileName: 'resume.txt', sourceText: 'Опыт' }),
    (error: unknown) => error instanceof HttpException && error.getStatus() === 429,
  );
  assert.equal(createCalled, false);
});

test('does not update another users sanitized text', async () => {
  let updateArguments: unknown;
  const database = {
    resume: {
      async updateMany(arguments_: unknown) {
        updateArguments = arguments_;
        return { count: 0 };
      },
    },
  };
  const service = new ResumesService(database as never);

  await assert.rejects(
    service.updateSanitizedTextForUser(secondUserId, 'resume-1', { sanitizedText: 'Безопасный текст' }),
    (error: unknown) => error instanceof NotFoundException,
  );
  assert.deepEqual(updateArguments, {
    where: { id: 'resume-1', userId: secondUserId },
    data: {
      sanitizedText: 'Безопасный текст',
      sanitizationStatus: 'PENDING_REVIEW',
      confirmedAt: null,
    },
  });
});

test('does not confirm another users resume', async () => {
  let updateArguments: unknown;
  let lookupArguments: unknown;
  const database = {
    resume: {
      async updateMany(arguments_: unknown) {
        updateArguments = arguments_;
        return { count: 0 };
      },
      async findFirst(arguments_: unknown) {
        lookupArguments = arguments_;
        return null;
      },
    },
  };
  const service = new ResumesService(database as never);

  await assert.rejects(
    service.confirmForUser(secondUserId, 'resume-1'),
    (error: unknown) => error instanceof NotFoundException,
  );
  assert.deepEqual((updateArguments as { where: unknown }).where, {
    id: 'resume-1',
    userId: secondUserId,
    sanitizationStatus: 'PENDING_REVIEW',
  });
  assert.equal(
    (updateArguments as { data: { sanitizationStatus: string } }).data.sanitizationStatus,
    'CONFIRMED',
  );
  assert.equal(
    (updateArguments as { data: { confirmedAt: unknown } }).data.confirmedAt instanceof Date,
    true,
  );
  assert.deepEqual(lookupArguments, {
    where: { id: 'resume-1', userId: secondUserId },
    select: { id: true },
  });
});

test('returns only the edited sanitized text for a resume preview', async () => {
  const database = {
    resume: {
      async updateMany() {
        return { count: 1 };
      },
      async findFirst() {
        return createDetailRecord(firstUserId);
      },
    },
  };
  const service = new ResumesService(database as never);

  const resume = await service.updateSanitizedTextForUser(firstUserId, 'resume-1', {
    sanitizedText: 'Безопасный текст',
  });

  assert.deepEqual(resume, {
    id: 'resume-1',
    title: 'Frontend resume',
    sourceType: 'FILE',
    sanitizationStatus: 'PENDING_REVIEW',
    confirmedAt: null,
    createdAt: '2026-07-28T12:00:00.000Z',
    updatedAt: '2026-07-28T12:00:00.000Z',
    sanitizedText: '[EMAIL_1] опыт',
    sanitizationVersion: 'resume-sanitization-v3',
  });
  assert.equal('sourceText' in resume, false);
});
