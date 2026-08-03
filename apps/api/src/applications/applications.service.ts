import {
  BadRequestException,
  Injectable,
  NotFoundException,
  Optional,
  ServiceUnavailableException,
} from '@nestjs/common';

import type {
  ApplicationCaseSummary,
  ArtifactSummary,
  InitialAnalysisResult,
  AnalysisRunSummary,
  CreateApplicationCaseFileRequest,
  CreateApplicationCaseRequest,
  UpdateArtifactRequest,
} from '@job-ai-assistant/contracts';

import { prisma } from '../database/prisma.service.js';
import { JobsService } from '../jobs/jobs.service.js';
import { sanitizeDirectIdentifiers } from '../resumes/resume-sanitizer.js';
import { getUsagePolicy } from '../usage/usage-policy.js';
import { AnalysisQuotaExceededException } from './analysis-quota-exceeded.exception.js';

const applicationCaseSummarySelect = {
  id: true,
  title: true,
  resumeId: true,
  vacancySourceType: true,
  status: true,
  currentStage: true,
  createdAt: true,
  updatedAt: true,
} as const;

type ApplicationCaseRecord = {
  id: string;
  title: string;
  resumeId: string;
  vacancySourceType: 'TEXT' | 'FILE';
  status: 'DRAFT' | 'ANALYZING' | 'ANALYSIS_READY' | 'FAILED';
  currentStage: string;
  createdAt: Date;
  updatedAt: Date;
};

const analysisRunSummarySelect = {
  id: true,
  applicationCaseId: true,
  workflowType: true,
  status: true,
  currentStage: true,
  errorCode: true,
  createdAt: true,
  updatedAt: true,
} as const;

const initialAnalysisResultSelect = {
  id: true,
  applicationCaseId: true,
  status: true,
  finalMarkdown: true,
} as const;

type AnalysisRunRecord = {
  id: string;
  applicationCaseId: string;
  workflowType: 'INITIAL_ANALYSIS';
  status: 'QUEUED' | 'RUNNING' | 'SUCCEEDED' | 'FAILED';
  currentStage: string | null;
  errorCode: string | null;
  createdAt: Date;
  updatedAt: Date;
};

@Injectable()
export class ApplicationsService {
  private readonly database: typeof prisma;

  constructor(
    @Optional() database?: typeof prisma,
    @Optional() private readonly jobsService?: JobsService,
  ) {
    this.database = database ?? prisma;
  }

  async launchInitialAnalysisForUser(userId: string, applicationCaseId: string): Promise<AnalysisRunSummary> {
    const analysisRun = await this.database.$transaction(async (transaction) => {
      const applicationCase = await transaction.applicationCase.findFirst({
        where: { id: applicationCaseId, userId },
        select: { id: true, status: true },
      });

      if (applicationCase === null) {
        throw new NotFoundException();
      }

      if (applicationCase.status !== 'DRAFT') {
        throw new BadRequestException('Initial analysis has already been started.');
      }

      const user = await transaction.user.findUnique({
        where: { id: userId },
        select: { planCode: true },
      });

      if (user === null) {
        throw new NotFoundException();
      }

      const reservation = await transaction.user.updateMany({
        where: {
          id: userId,
          initialAnalysisUnitsUsed: { lt: getUsagePolicy(user.planCode).productUnitLimit },
        },
        data: { initialAnalysisUnitsUsed: { increment: 1 } },
      });

      if (reservation.count !== 1) {
        throw new AnalysisQuotaExceededException();
      }

      await transaction.applicationCase.update({
        where: { id: applicationCase.id },
        data: { status: 'ANALYZING' },
      });

      return transaction.analysisRun.create({
        data: {
          applicationCaseId: applicationCase.id,
          workflowType: 'INITIAL_ANALYSIS',
          status: 'QUEUED',
        },
        select: analysisRunSummarySelect,
      });
    });

    try {
      const queueJobId = await this.getJobsService().enqueueInitialAnalysis({
        applicationCaseId: analysisRun.applicationCaseId,
        analysisRunId: analysisRun.id,
      });
      await this.database.analysisRun.update({
        where: { id: analysisRun.id },
        data: { queueJobId },
      });
    } catch {
      await this.database.$transaction([
        this.database.analysisRun.update({
          where: { id: analysisRun.id },
          data: {
            status: 'FAILED',
            finishedAt: new Date(),
            errorCode: 'QUEUE_UNAVAILABLE',
            errorMessageSanitized: 'QUEUE_UNAVAILABLE',
          },
        }),
        this.database.applicationCase.update({
          where: { id: analysisRun.applicationCaseId },
          data: { status: 'FAILED' },
        }),
        this.database.user.update({
          where: { id: userId },
          data: { initialAnalysisUnitsUsed: { decrement: 1 } },
        }),
      ]);
      throw new ServiceUnavailableException();
    }

    return toAnalysisRunSummary(analysisRun);
  }

  async getInitialAnalysisRunForUser(
    userId: string,
    applicationCaseId: string,
    analysisRunId: string,
  ): Promise<AnalysisRunSummary> {
    const analysisRun = await this.database.analysisRun.findFirst({
      where: {
        id: analysisRunId,
        applicationCaseId,
        workflowType: 'INITIAL_ANALYSIS',
        applicationCase: { userId },
      },
      select: analysisRunSummarySelect,
    });

    if (analysisRun === null) {
      throw new NotFoundException();
    }

    return toAnalysisRunSummary(analysisRun);
  }

  async getInitialAnalysisResultForUser(
    userId: string,
    applicationCaseId: string,
    analysisRunId: string,
  ): Promise<InitialAnalysisResult> {
    const analysisRun = await this.database.analysisRun.findFirst({
      where: {
        id: analysisRunId,
        applicationCaseId,
        workflowType: 'INITIAL_ANALYSIS',
        applicationCase: { userId },
      },
      select: initialAnalysisResultSelect,
    });

    if (analysisRun === null) {
      throw new NotFoundException();
    }

    if (analysisRun.status !== 'SUCCEEDED' || analysisRun.finalMarkdown === null) {
      throw new BadRequestException('Initial analysis result is not ready.');
    }

    return {
      id: analysisRun.id,
      applicationCaseId: analysisRun.applicationCaseId,
      finalMarkdown: analysisRun.finalMarkdown,
    };
  }

  async getArtifactsForUser(userId: string, applicationCaseId: string): Promise<ArtifactSummary[]> {
    const applicationCase = await this.database.applicationCase.findFirst({
      where: { id: applicationCaseId, userId },
      select: { id: true },
    });

    if (applicationCase === null) {
      throw new NotFoundException();
    }

    const artifacts = await this.database.artifact.findMany({
      where: { applicationCaseId: applicationCase.id },
      orderBy: { createdAt: 'asc' },
      select: { id: true, applicationCaseId: true, type: true, generatedContent: true, editedContent: true, updatedAt: true },
    });

    return artifacts.map((artifact) => ({ ...artifact, updatedAt: artifact.updatedAt.toISOString() }));
  }

  async updateArtifactForUser(
    userId: string,
    applicationCaseId: string,
    artifactId: string,
    input: UpdateArtifactRequest,
  ): Promise<ArtifactSummary> {
    const artifact = await this.database.artifact.findFirst({
      where: { id: artifactId, applicationCaseId, applicationCase: { userId } },
      select: { id: true },
    });

    if (artifact === null) {
      throw new NotFoundException();
    }

    const updatedArtifact = await this.database.artifact.update({
      where: { id: artifact.id },
      data: { editedContent: input.editedContent },
      select: { id: true, applicationCaseId: true, type: true, generatedContent: true, editedContent: true, updatedAt: true },
    });

    return { ...updatedArtifact, updatedAt: updatedArtifact.updatedAt.toISOString() };
  }

  async resetArtifactToGeneratedContentForUser(
    userId: string,
    applicationCaseId: string,
    artifactId: string,
  ): Promise<ArtifactSummary> {
    const artifact = await this.database.artifact.findFirst({
      where: { id: artifactId, applicationCaseId, applicationCase: { userId } },
      select: { id: true },
    });

    if (artifact === null) {
      throw new NotFoundException();
    }

    const updatedArtifact = await this.database.artifact.update({
      where: { id: artifact.id },
      data: { editedContent: null },
      select: { id: true, applicationCaseId: true, type: true, generatedContent: true, editedContent: true, updatedAt: true },
    });

    return { ...updatedArtifact, updatedAt: updatedArtifact.updatedAt.toISOString() };
  }

  async createTextDraftForUser(
    userId: string,
    input: CreateApplicationCaseRequest,
  ): Promise<ApplicationCaseSummary> {
    return this.createDraftForUser(userId, input, { sourceType: 'TEXT' });
  }

  async createFileDraftForUser(
    userId: string,
    input: CreateApplicationCaseFileRequest,
    file: { sourceFileName: string; sourceText: string },
  ): Promise<ApplicationCaseSummary> {
    return this.createDraftForUser(userId, { ...input, vacancyText: file.sourceText }, {
      sourceType: 'FILE',
      sourceFileName: file.sourceFileName,
    });
  }

  private async createDraftForUser(
    userId: string,
    input: CreateApplicationCaseRequest,
    source: { sourceType: 'TEXT' | 'FILE'; sourceFileName?: string },
  ): Promise<ApplicationCaseSummary> {
    const resume = await this.database.resume.findFirst({
      where: { id: input.resumeId, userId, sanitizationStatus: 'CONFIRMED' },
      select: { sanitizedText: true },
    });

    if (resume === null) {
      const ownedResume = await this.database.resume.findFirst({
        where: { id: input.resumeId, userId },
        select: { id: true },
      });

      if (ownedResume === null) {
        throw new NotFoundException();
      }

      throw new BadRequestException('The selected resume must be confirmed.');
    }

    const { sanitizedText: vacancySanitizedText } = sanitizeDirectIdentifiers(input.vacancyText);
    const applicationCase = await this.database.applicationCase.create({
      data: {
        userId,
        resumeId: input.resumeId,
        title: input.title,
        vacancySourceType: source.sourceType,
        ...(source.sourceFileName === undefined ? {} : { vacancySourceFileName: source.sourceFileName }),
        vacancySourceText: input.vacancyText,
        vacancySanitizedText,
        resumeSanitizedText: resume.sanitizedText,
      },
      select: applicationCaseSummarySelect,
    });

    return toApplicationCaseSummary(applicationCase);
  }

  private getJobsService(): JobsService {
    if (this.jobsService === undefined) {
      throw new Error('JobsService is not configured.');
    }

    return this.jobsService;
  }
}

function toApplicationCaseSummary(record: ApplicationCaseRecord): ApplicationCaseSummary {
  if (record.currentStage !== 'DRAFT') {
    throw new Error('Unexpected application case stage for a draft response.');
  }

  return {
    id: record.id,
    title: record.title,
    resumeId: record.resumeId,
    vacancySourceType: record.vacancySourceType,
    status: record.status,
    currentStage: 'DRAFT',
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  };
}

function toAnalysisRunSummary(record: AnalysisRunRecord): AnalysisRunSummary {
  return {
    id: record.id,
    applicationCaseId: record.applicationCaseId,
    workflowType: record.workflowType,
    status: record.status,
    currentStage: record.currentStage,
    errorCode: record.errorCode,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  };
}
