import { Body, Controller, Delete, Get, Param, Patch, Post, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';

import {
  API_SCHEMA_VERSION,
  ApplicationCaseResponseSchema,
  ArtifactListResponseSchema,
  ArtifactResponseSchema,
  InitialAnalysisResultResponseSchema,
  AnalysisRunResponseSchema,
} from '@job-ai-assistant/contracts';

import { CurrentSession, type AuthenticatedSession } from '../auth/authentication.guard.js';
import {
  parseCreateApplicationCaseFileRequest,
  parseCreateApplicationCaseRequest,
  parseAnalysisRunId,
  parseArtifactId,
  parseApplicationCaseId,
  parseUpdateArtifactRequest,
} from './applications.request.js';
import { ApplicationsService } from './applications.service.js';
import {
  extractUploadedVacancyFile,
  filterVacancyUpload,
  getMaxVacancyFileSizeBytes,
  type UploadedVacancyFile,
} from './vacancy-file.js';

@Controller('applications')
export class ApplicationsController {
  constructor(private readonly applicationsService: ApplicationsService) {}

  @Post()
  async createTextDraft(
    @CurrentSession() session: AuthenticatedSession,
    @Body() body: unknown,
  ) {
    const applicationCase = await this.applicationsService.createTextDraftForUser(
      session.user.id,
      parseCreateApplicationCaseRequest(body),
    );

    return ApplicationCaseResponseSchema.parse({
      schemaVersion: API_SCHEMA_VERSION,
      applicationCase,
    });
  }

  @Post('file')
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: getMaxVacancyFileSizeBytes(), files: 1, fields: 2 },
      fileFilter: filterVacancyUpload,
    }),
  )
  async createFileDraft(
    @CurrentSession() session: AuthenticatedSession,
    @Body() body: unknown,
    @UploadedFile() file: UploadedVacancyFile | undefined,
  ) {
    const input = parseCreateApplicationCaseFileRequest(body);
    const extractedFile = await extractUploadedVacancyFile(file);
    const applicationCase = await this.applicationsService.createFileDraftForUser(
      session.user.id,
      input,
      extractedFile,
    );

    return ApplicationCaseResponseSchema.parse({
      schemaVersion: API_SCHEMA_VERSION,
      applicationCase,
    });
  }

  @Post(':applicationCaseId/analysis')
  async launchInitialAnalysis(
    @CurrentSession() session: AuthenticatedSession,
    @Param('applicationCaseId') applicationCaseId: string,
  ) {
    const analysisRun = await this.applicationsService.launchInitialAnalysisForUser(
      session.user.id,
      parseApplicationCaseId(applicationCaseId),
    );

    return AnalysisRunResponseSchema.parse({
      schemaVersion: API_SCHEMA_VERSION,
      analysisRun,
    });
  }

  @Get(':applicationCaseId/analysis/:analysisRunId')
  async getInitialAnalysisStatus(
    @CurrentSession() session: AuthenticatedSession,
    @Param('applicationCaseId') applicationCaseId: string,
    @Param('analysisRunId') analysisRunId: string,
  ) {
    const analysisRun = await this.applicationsService.getInitialAnalysisRunForUser(
      session.user.id,
      parseApplicationCaseId(applicationCaseId),
      parseAnalysisRunId(analysisRunId),
    );

    return AnalysisRunResponseSchema.parse({
      schemaVersion: API_SCHEMA_VERSION,
      analysisRun,
    });
  }

  @Get(':applicationCaseId/artifacts')
  async getArtifacts(
    @CurrentSession() session: AuthenticatedSession,
    @Param('applicationCaseId') applicationCaseId: string,
  ) {
    const artifacts = await this.applicationsService.getArtifactsForUser(
      session.user.id,
      parseApplicationCaseId(applicationCaseId),
    );

    return ArtifactListResponseSchema.parse({ schemaVersion: API_SCHEMA_VERSION, artifacts });
  }

  @Patch(':applicationCaseId/artifacts/:artifactId')
  async updateArtifact(
    @CurrentSession() session: AuthenticatedSession,
    @Param('applicationCaseId') applicationCaseId: string,
    @Param('artifactId') artifactId: string,
    @Body() body: unknown,
  ) {
    const artifact = await this.applicationsService.updateArtifactForUser(
      session.user.id,
      parseApplicationCaseId(applicationCaseId),
      parseArtifactId(artifactId),
      parseUpdateArtifactRequest(body),
    );

    return ArtifactResponseSchema.parse({ schemaVersion: API_SCHEMA_VERSION, artifact });
  }

  @Delete(':applicationCaseId/artifacts/:artifactId/edited-content')
  async resetArtifactToGeneratedContent(
    @CurrentSession() session: AuthenticatedSession,
    @Param('applicationCaseId') applicationCaseId: string,
    @Param('artifactId') artifactId: string,
  ) {
    const artifact = await this.applicationsService.resetArtifactToGeneratedContentForUser(
      session.user.id,
      parseApplicationCaseId(applicationCaseId),
      parseArtifactId(artifactId),
    );

    return ArtifactResponseSchema.parse({ schemaVersion: API_SCHEMA_VERSION, artifact });
  }

  @Get(':applicationCaseId/analysis/:analysisRunId/result')
  async getInitialAnalysisResult(
    @CurrentSession() session: AuthenticatedSession,
    @Param('applicationCaseId') applicationCaseId: string,
    @Param('analysisRunId') analysisRunId: string,
  ) {
    const analysisResult = await this.applicationsService.getInitialAnalysisResultForUser(
      session.user.id,
      parseApplicationCaseId(applicationCaseId),
      parseAnalysisRunId(analysisRunId),
    );

    return InitialAnalysisResultResponseSchema.parse({
      schemaVersion: API_SCHEMA_VERSION,
      analysisResult,
    });
  }
}
