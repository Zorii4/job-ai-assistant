import { BadRequestException, Body, Controller, Delete, Get, Param, Patch, Post, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';

import {
  API_SCHEMA_VERSION,
  ApplicationCaseAnalysisListResponseSchema,
  ApplicationCaseResponseSchema,
  ArtifactListResponseSchema,
  ArtifactResponseSchema,
  InitialAnalysisResultResponseSchema,
  AnalysisRunResponseSchema,
  UpdateApplicationCaseStageRequestSchema,
} from '@job-ai-assistant/contracts';

import { CurrentSession, type AuthenticatedSession } from '../auth/authentication.guard.js';
import {
  parseCreateApplicationCaseFileRequest,
  parseCreatePostInterviewRequest,
  parseAnalysisRunId,
  parseArtifactId,
  parseApplicationCaseId,
  parseUpdateArtifactRequest,
  parseUpdateInitialAnalysisResultRequest,
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

  @Get()
  async listAnalysisCases(@CurrentSession() session: AuthenticatedSession) {
    const applicationCases = await this.applicationsService.listAnalysisCasesForUser(session.user.id);

    return ApplicationCaseAnalysisListResponseSchema.parse({
      schemaVersion: API_SCHEMA_VERSION,
      applicationCases,
    });
  }

  @Patch(':applicationCaseId/stage')
  async updateStage(@CurrentSession() session: AuthenticatedSession, @Param('applicationCaseId') applicationCaseId: string, @Body() body: unknown) {
    const parsed = UpdateApplicationCaseStageRequestSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException();
    await this.applicationsService.updateStageForUser(session.user.id, parseApplicationCaseId(applicationCaseId), parsed.data.status);
    return { schemaVersion: API_SCHEMA_VERSION };
  }

  @Delete(':applicationCaseId')
  async deleteCompleted(@CurrentSession() session: AuthenticatedSession, @Param('applicationCaseId') applicationCaseId: string) {
    await this.applicationsService.deleteCompletedForUser(session.user.id, parseApplicationCaseId(applicationCaseId));
    return { schemaVersion: API_SCHEMA_VERSION };
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

  @Post(':applicationCaseId/hr-preparation')
  async launchHrPreparation(
    @CurrentSession() session: AuthenticatedSession,
    @Param('applicationCaseId') applicationCaseId: string,
  ) {
    const analysisRun = await this.applicationsService.launchHrPreparationForUser(
      session.user.id,
      parseApplicationCaseId(applicationCaseId),
    );

    return AnalysisRunResponseSchema.parse({
      schemaVersion: API_SCHEMA_VERSION,
      analysisRun,
    });
  }

  @Post(':applicationCaseId/post-interview')
  async launchPostInterview(
    @CurrentSession() session: AuthenticatedSession,
    @Param('applicationCaseId') applicationCaseId: string,
    @Body() body: unknown,
  ) {
    const analysisRun = await this.applicationsService.launchPostInterviewForUser(
      session.user.id,
      parseApplicationCaseId(applicationCaseId),
      parseCreatePostInterviewRequest(body),
    );

    return AnalysisRunResponseSchema.parse({
      schemaVersion: API_SCHEMA_VERSION,
      analysisRun,
    });
  }

  @Post(':applicationCaseId/post-interview/retry')
  async retryPostInterview(
    @CurrentSession() session: AuthenticatedSession,
    @Param('applicationCaseId') applicationCaseId: string,
  ) {
    const analysisRun = await this.applicationsService.retryPostInterviewForUser(
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

  @Patch(':applicationCaseId/analysis/:analysisRunId/result')
  async updateInitialAnalysisResult(
    @CurrentSession() session: AuthenticatedSession,
    @Param('applicationCaseId') applicationCaseId: string,
    @Param('analysisRunId') analysisRunId: string,
    @Body() body: unknown,
  ) {
    const analysisResult = await this.applicationsService.updateInitialAnalysisResultForUser(
      session.user.id, parseApplicationCaseId(applicationCaseId), parseAnalysisRunId(analysisRunId), parseUpdateInitialAnalysisResultRequest(body),
    );
    return InitialAnalysisResultResponseSchema.parse({ schemaVersion: API_SCHEMA_VERSION, analysisResult });
  }

  @Delete(':applicationCaseId/analysis/:analysisRunId/result/edited-markdown')
  async resetInitialAnalysisResult(
    @CurrentSession() session: AuthenticatedSession,
    @Param('applicationCaseId') applicationCaseId: string,
    @Param('analysisRunId') analysisRunId: string,
  ) {
    const analysisResult = await this.applicationsService.resetInitialAnalysisResultForUser(
      session.user.id, parseApplicationCaseId(applicationCaseId), parseAnalysisRunId(analysisRunId),
    );
    return InitialAnalysisResultResponseSchema.parse({ schemaVersion: API_SCHEMA_VERSION, analysisResult });
  }
}
