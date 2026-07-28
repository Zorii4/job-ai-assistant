import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';

import {
  API_SCHEMA_VERSION,
  ResumeDetailResponseSchema,
  ResumeListResponseSchema,
  ResumeResponseSchema,
} from '@job-ai-assistant/contracts';

import { CurrentSession, type AuthenticatedSession } from '../auth/authentication.guard.js';
import {
  extractUploadedResumeFile,
  filterResumeUpload,
  getMaxResumeFileSizeBytes,
  type UploadedResumeFile,
} from './resume-file.js';
import {
  parseResumeFileRequest,
  parseResumeId,
  parseResumeRequest,
  parseUpdateSanitizedResumeRequest,
} from './resumes.request.js';
import { ResumesService } from './resumes.service.js';

@Controller('resumes')
export class ResumesController {
  constructor(private readonly resumesService: ResumesService) {}

  @Post()
  async create(
    @CurrentSession() session: AuthenticatedSession,
    @Body() body: unknown,
  ) {
    const input = parseResumeRequest(body);
    const resume = await this.resumesService.createTextDraft(session.user.id, input);

    return ResumeResponseSchema.parse({ schemaVersion: API_SCHEMA_VERSION, resume });
  }

  @Post('file')
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: getMaxResumeFileSizeBytes(), files: 1, fields: 1 },
      fileFilter: filterResumeUpload,
    }),
  )
  async createFromFile(
    @CurrentSession() session: AuthenticatedSession,
    @Body() body: unknown,
    @UploadedFile() file: UploadedResumeFile | undefined,
  ) {
    const input = parseResumeFileRequest(body);
    const extractedFile = await extractUploadedResumeFile(file);
    const resume = await this.resumesService.createFileDraft(session.user.id, input, extractedFile);

    return ResumeResponseSchema.parse({ schemaVersion: API_SCHEMA_VERSION, resume });
  }

  @Get()
  async list(@CurrentSession() session: AuthenticatedSession) {
    const resumes = await this.resumesService.listForUser(session.user.id);

    return ResumeListResponseSchema.parse({ schemaVersion: API_SCHEMA_VERSION, resumes });
  }

  @Get(':resumeId')
  async getPreview(
    @CurrentSession() session: AuthenticatedSession,
    @Param('resumeId') resumeId: string,
  ) {
    const resume = await this.resumesService.getPreviewForUser(
      session.user.id,
      parseResumeId(resumeId),
    );

    return ResumeDetailResponseSchema.parse({ schemaVersion: API_SCHEMA_VERSION, resume });
  }

  @Patch(':resumeId/sanitized-text')
  async updateSanitizedText(
    @CurrentSession() session: AuthenticatedSession,
    @Param('resumeId') resumeId: string,
    @Body() body: unknown,
  ) {
    const resume = await this.resumesService.updateSanitizedTextForUser(
      session.user.id,
      parseResumeId(resumeId),
      parseUpdateSanitizedResumeRequest(body),
    );

    return ResumeDetailResponseSchema.parse({ schemaVersion: API_SCHEMA_VERSION, resume });
  }

  @Post(':resumeId/confirm')
  async confirm(
    @CurrentSession() session: AuthenticatedSession,
    @Param('resumeId') resumeId: string,
  ) {
    const resume = await this.resumesService.confirmForUser(
      session.user.id,
      parseResumeId(resumeId),
    );

    return ResumeDetailResponseSchema.parse({ schemaVersion: API_SCHEMA_VERSION, resume });
  }

  @Delete(':resumeId')
  @HttpCode(204)
  async remove(
    @CurrentSession() session: AuthenticatedSession,
    @Param('resumeId') resumeId: string,
  ): Promise<void> {
    await this.resumesService.deleteForUser(session.user.id, parseResumeId(resumeId));
  }
}
