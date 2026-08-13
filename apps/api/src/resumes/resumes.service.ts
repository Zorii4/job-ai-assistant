import {
  ConflictException,
  HttpException,
  HttpStatus,
  Injectable,
  NotFoundException,
  Optional,
} from '@nestjs/common';

import type {
  CreateResumeFileRequest,
  ResumeDetail,
  ResumeSummary,
  UpdateSanitizedResumeRequest,
} from '@job-ai-assistant/contracts';

import { prisma } from '../database/prisma.service.js';
import { sanitizeDirectIdentifiers } from './resume-sanitizer.js';

const SANITIZATION_VERSION = 'resume-sanitization-v4';
const MAX_RESUMES_PER_USER = 5;

const resumeSummarySelect = {
  id: true,
  title: true,
  sourceType: true,
  sanitizationStatus: true,
  confirmedAt: true,
  createdAt: true,
  updatedAt: true,
} as const;

const resumeDetailSelect = {
  ...resumeSummarySelect,
  sanitizedText: true,
  sanitizationVersion: true,
} as const;

type ResumeRecord = {
  id: string;
  title: string;
  sourceType: 'FILE';
  sanitizationStatus: 'PENDING_REVIEW' | 'CONFIRMED';
  confirmedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

type ResumeDetailRecord = ResumeRecord & {
  sanitizedText: string;
  sanitizationVersion: string;
};

@Injectable()
export class ResumesService {
  private readonly database: typeof prisma;

  constructor(@Optional() database?: typeof prisma) {
    this.database = database ?? prisma;
  }

  async createFileDraft(
    userId: string,
    input: CreateResumeFileRequest,
    file: { sourceFileName: string; sourceText: string },
  ): Promise<ResumeSummary> {
    return this.createDraft(userId, {
      title: input.title,
      sourceType: 'FILE',
      sourceFileName: file.sourceFileName,
      sourceText: file.sourceText,
    });
  }

  private async createDraft(
    userId: string,
    input: {
      title: string;
      sourceType: 'FILE';
      sourceFileName?: string;
      sourceText: string;
    },
  ): Promise<ResumeSummary> {
    const { sanitizedText } = sanitizeDirectIdentifiers(input.sourceText);

    for (let attempt = 0; attempt < MAX_RESUMES_PER_USER; attempt += 1) {
      const occupiedSlots = await this.database.resume.findMany({
        where: { userId },
        select: { slot: true },
      });
      const slot = findAvailableSlot(occupiedSlots.map((resume) => resume.slot));

      if (slot === null) {
        throw new ResumeLimitReachedException();
      }

      try {
        const resume = await this.database.resume.create({
          data: {
            userId,
            slot,
            title: input.title,
            sourceType: input.sourceType,
            ...(input.sourceFileName === undefined
              ? {}
              : { sourceFileName: input.sourceFileName }),
            sourceText: input.sourceText,
            sanitizedText,
            sanitizationStatus: 'PENDING_REVIEW',
            sanitizationVersion: SANITIZATION_VERSION,
          },
          select: resumeSummarySelect,
        });

        return toResumeSummary(resume);
      } catch (error) {
        if (!isResumeSlotConflict(error) || attempt === MAX_RESUMES_PER_USER - 1) {
          throw error;
        }
      }
    }

    throw new ResumeLimitReachedException();
  }

  async listForUser(userId: string): Promise<ResumeSummary[]> {
    const resumes = await this.database.resume.findMany({
      where: { userId },
      orderBy: { updatedAt: 'desc' },
      select: resumeSummarySelect,
    });

    return resumes.map(toResumeSummary);
  }

  async getPreviewForUser(userId: string, resumeId: string): Promise<ResumeDetail> {
    const resume = await this.database.resume.findFirst({
      where: { id: resumeId, userId },
      select: resumeDetailSelect,
    });

    if (resume === null) {
      throw new NotFoundException();
    }

    return toResumeDetail(resume);
  }

  async updateSanitizedTextForUser(
    userId: string,
    resumeId: string,
    input: UpdateSanitizedResumeRequest,
  ): Promise<ResumeDetail> {
    const result = await this.database.resume.updateMany({
      where: { id: resumeId, userId },
      data: {
        sanitizedText: input.sanitizedText,
        sanitizationStatus: 'PENDING_REVIEW',
        confirmedAt: null,
      },
    });

    if (result.count !== 1) {
      throw new NotFoundException();
    }

    return this.getPreviewForUser(userId, resumeId);
  }

  async confirmForUser(userId: string, resumeId: string): Promise<ResumeDetail> {
    const result = await this.database.resume.updateMany({
      where: { id: resumeId, userId, sanitizationStatus: 'PENDING_REVIEW' },
      data: {
        sanitizationStatus: 'CONFIRMED',
        confirmedAt: new Date(),
        sourceText: '',
        sourceFileName: null,
      },
    });

    if (result.count === 0) {
      const exists = await this.database.resume.findFirst({
        where: { id: resumeId, userId },
        select: { id: true },
      });

      if (exists === null) {
        throw new NotFoundException();
      }
    }

    return this.getPreviewForUser(userId, resumeId);
  }

  async deleteForUser(userId: string, resumeId: string): Promise<void> {
    const resume = await this.database.resume.findFirst({
      where: { id: resumeId, userId },
      select: { id: true },
    });

    if (resume === null) {
      throw new NotFoundException();
    }

    const applicationCase = await this.database.applicationCase.findFirst({
      where: { resumeId: resume.id, userId },
      select: { id: true },
    });

    if (applicationCase !== null) {
      throw new ResumeInUseException();
    }

    try {
      await this.database.resume.delete({ where: { id: resume.id } });
    } catch (error) {
      if (isResumeInUseError(error)) {
        throw new ResumeInUseException();
      }

      throw error;
    }
  }
}

function toResumeSummary(resume: ResumeRecord): ResumeSummary {
  return {
    id: resume.id,
    title: resume.title,
    sourceType: resume.sourceType,
    sanitizationStatus: resume.sanitizationStatus,
    confirmedAt: resume.confirmedAt?.toISOString() ?? null,
    createdAt: resume.createdAt.toISOString(),
    updatedAt: resume.updatedAt.toISOString(),
  };
}

function toResumeDetail(resume: ResumeDetailRecord): ResumeDetail {
  return {
    ...toResumeSummary(resume),
    sanitizedText: resume.sanitizedText,
    sanitizationVersion: resume.sanitizationVersion,
  };
}

function findAvailableSlot(occupiedSlots: number[]): number | null {
  for (let slot = 1; slot <= MAX_RESUMES_PER_USER; slot += 1) {
    if (!occupiedSlots.includes(slot)) {
      return slot;
    }
  }

  return null;
}

function isResumeSlotConflict(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    error.code === 'P2002'
  );
}

function isResumeInUseError(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 'P2003';
}

class ResumeLimitReachedException extends HttpException {
  constructor() {
    super('Resume limit reached.', HttpStatus.TOO_MANY_REQUESTS);
  }
}

class ResumeInUseException extends ConflictException {
  constructor() {
    super('Нельзя удалить резюме, пока оно используется в сохранённой вакансии.');
  }
}
