import {
  BadRequestException,
  ConflictException,
  HttpException,
  HttpStatus,
  Injectable,
  NotFoundException,
  Optional,
  ServiceUnavailableException,
} from '@nestjs/common';

import type {
  ApplicationCaseSummary,
  ApplicationCaseAnalysisSummary,
  ArtifactSummary,
  InitialAnalysisResult,
  AnalysisRunSummary,
  CreateApplicationCaseFileRequest,
  UpdateArtifactRequest,
  UpdateInitialAnalysisResultRequest,
} from '@job-ai-assistant/contracts';

import { ApplicationCaseStatus, Prisma } from '../generated/prisma/client.js';
import { prisma } from '../database/prisma.service.js';
import { JobsService } from '../jobs/jobs.service.js';
import { sanitizeDirectIdentifiers } from '../resumes/resume-sanitizer.js';
import { getUsagePolicy } from '../usage/usage-policy.js';
import { AnalysisQuotaExceededException } from './analysis-quota-exceeded.exception.js';
import { AnalysisCapacityExceededException } from './analysis-capacity-exceeded.exception.js';

const maxActiveInitialAnalysisRuns = 2;
const maxApplicationCasesPerUser = 10;
const serializationRetryLimit = 3;
const removableApplicationCaseStatuses: ApplicationCaseStatus[] = ['REJECTED', 'OFFER', 'ARCHIVED'];

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
  vacancySourceType: 'FILE';
  status: 'DRAFT' | 'ANALYZING' | 'ANALYSIS_READY' | 'APPLIED' | 'WAITING_RESPONSE' | 'HR_INVITED' | 'HR_PREPARATION_READY' | 'HR_COMPLETED' | 'REJECTED' | 'OFFER' | 'ARCHIVED' | 'FAILED';
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
  editedFinalMarkdown: true,
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

type ApplicationCaseAnalysisRecord = {
  id: string;
  title: string;
  status: 'DRAFT' | 'ANALYZING' | 'ANALYSIS_READY' | 'APPLIED' | 'WAITING_RESPONSE' | 'HR_INVITED' | 'HR_PREPARATION_READY' | 'HR_COMPLETED' | 'REJECTED' | 'OFFER' | 'ARCHIVED' | 'FAILED';
  currentStage: string;
  createdAt: Date;
  updatedAt: Date;
  analysisRuns: AnalysisRunRecord[];
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

  async listAnalysisCasesForUser(userId: string): Promise<ApplicationCaseAnalysisSummary[]> {
    const applicationCases = await this.database.applicationCase.findMany({
      where: { userId },
      orderBy: { updatedAt: 'desc' },
      select: {
        id: true,
        title: true,
        status: true,
        currentStage: true,
        createdAt: true,
        updatedAt: true,
        analysisRuns: { select: analysisRunSummarySelect },
      },
    });

    return applicationCases.map(toApplicationCaseAnalysisSummary);
  }

  async updateStageForUser(userId: string, applicationCaseId: string, status: import('@job-ai-assistant/contracts').ApplicationCaseStatus) {
    return this.database.$transaction(async (transaction) => {
      const applicationCase = await transaction.applicationCase.findFirst({ where: { id: applicationCaseId, userId }, select: { id: true, status: true } });
      if (applicationCase === null) throw new NotFoundException();
      if (applicationCase.status === status) return;
      await transaction.applicationCase.update({ where: { id: applicationCase.id }, data: { status, currentStage: status } });
      await transaction.stageEvent.create({ data: { applicationCaseId: applicationCase.id, fromStage: applicationCase.status, toStage: status, source: 'USER' } });
    });
  }

  async deleteCompletedForUser(userId: string, applicationCaseId: string): Promise<void> {
    const result = await this.database.applicationCase.deleteMany({
      where: { id: applicationCaseId, userId, status: { in: removableApplicationCaseStatuses } },
    });
    if (result.count === 1) return;

    const applicationCase = await this.database.applicationCase.findFirst({ where: { id: applicationCaseId, userId }, select: { id: true } });
    if (applicationCase === null) throw new NotFoundException();
    throw new ConflictException('Active application cases cannot be deleted.');
  }

  async launchInitialAnalysisForUser(userId: string, applicationCaseId: string): Promise<AnalysisRunSummary> {
    const analysisRun = await this.runSerializableTransaction(async (transaction) => {
      const applicationCase = await transaction.applicationCase.findFirst({
        where: { id: applicationCaseId, userId },
        select: { id: true, status: true },
      });

      if (applicationCase === null) {
        throw new NotFoundException();
      }

      if (applicationCase.status !== 'DRAFT' && applicationCase.status !== 'FAILED') {
        throw new BadRequestException('Initial analysis has already been started.');
      }

      const failedRun = applicationCase.status === 'FAILED'
        ? await transaction.analysisRun.findFirst({
          where: {
            applicationCaseId: applicationCase.id,
            workflowType: 'INITIAL_ANALYSIS',
            status: 'FAILED',
          },
          select: { id: true },
        })
        : null;

      if (applicationCase.status === 'FAILED' && failedRun === null) {
        throw new BadRequestException('Failed initial analysis run is unavailable.');
      }

      const user = await transaction.user.findUnique({
        where: { id: userId },
        select: { planCode: true },
      });

      if (user === null) {
        throw new NotFoundException();
      }

      const activeRunCount = await transaction.analysisRun.count({
        where: {
          workflowType: 'INITIAL_ANALYSIS',
          status: { in: ['QUEUED', 'RUNNING'] },
          applicationCase: { userId },
        },
      });

      if (activeRunCount >= maxActiveInitialAnalysisRuns) {
        throw new AnalysisCapacityExceededException();
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
        data: { status: 'ANALYZING', currentStage: 'ANALYZING' },
      });
      await transaction.stageEvent.create({ data: { applicationCaseId: applicationCase.id, fromStage: applicationCase.status, toStage: 'ANALYZING', source: 'SYSTEM' } });

      if (failedRun !== null) {
        return transaction.analysisRun.update({
          where: { id: failedRun.id },
          data: {
            status: 'QUEUED',
            currentStage: null,
            errorCode: null,
            errorMessageSanitized: null,
            queueJobId: null,
            startedAt: null,
            finishedAt: null,
            finalMarkdown: null,
            editedFinalMarkdown: null,
          },
          select: analysisRunSummarySelect,
        });
      }

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
          data: { status: 'FAILED', currentStage: 'FAILED' },
        }),
        this.database.stageEvent.create({
          data: {
            applicationCaseId: analysisRun.applicationCaseId,
            fromStage: 'ANALYZING',
            toStage: 'FAILED',
            source: 'SYSTEM',
          },
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
      editedFinalMarkdown: analysisRun.editedFinalMarkdown,
    };
  }

  async updateInitialAnalysisResultForUser(
    userId: string,
    applicationCaseId: string,
    analysisRunId: string,
    input: UpdateInitialAnalysisResultRequest,
  ): Promise<InitialAnalysisResult> {
    const analysisRun = await this.getEditableInitialAnalysisRunForUser(userId, applicationCaseId, analysisRunId);
    const updated = await this.database.analysisRun.update({
      where: { id: analysisRun.id },
      data: { editedFinalMarkdown: input.editedFinalMarkdown },
      select: initialAnalysisResultSelect,
    });

    return toInitialAnalysisResult(updated);
  }

  async resetInitialAnalysisResultForUser(
    userId: string,
    applicationCaseId: string,
    analysisRunId: string,
  ): Promise<InitialAnalysisResult> {
    const analysisRun = await this.getEditableInitialAnalysisRunForUser(userId, applicationCaseId, analysisRunId);
    const updated = await this.database.analysisRun.update({
      where: { id: analysisRun.id },
      data: { editedFinalMarkdown: null },
      select: initialAnalysisResultSelect,
    });

    return toInitialAnalysisResult(updated);
  }

  private async getEditableInitialAnalysisRunForUser(userId: string, applicationCaseId: string, analysisRunId: string) {
    const analysisRun = await this.database.analysisRun.findFirst({
      where: { id: analysisRunId, applicationCaseId, workflowType: 'INITIAL_ANALYSIS', applicationCase: { userId } },
      select: initialAnalysisResultSelect,
    });

    if (analysisRun === null) throw new NotFoundException();
    if (analysisRun.status !== 'SUCCEEDED' || analysisRun.finalMarkdown === null) throw new BadRequestException('Initial analysis result is not ready.');

    return analysisRun;
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

  async createFileDraftForUser(
    userId: string,
    input: CreateApplicationCaseFileRequest,
    file: { sourceFileName: string; sourceText: string },
  ): Promise<ApplicationCaseSummary> {
    return this.createDraftForUser(userId, input, file);
  }

  private async createDraftForUser(
    userId: string,
    input: CreateApplicationCaseFileRequest,
    file: { sourceFileName: string; sourceText: string },
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

    const applicationCaseCount = await this.database.applicationCase.count({ where: { userId } });
    if (applicationCaseCount >= maxApplicationCasesPerUser) {
      const candidate = await this.database.applicationCase.findFirst({ where: { userId, status: { in: removableApplicationCaseStatuses } }, orderBy: { createdAt: 'asc' }, select: { id: true } });
      if (candidate === null || input.replacementApplicationCaseId !== candidate.id) throw new ApplicationCaseLimitReachedException();
      const deleted = await this.database.applicationCase.deleteMany({ where: { id: candidate.id, userId, status: { in: removableApplicationCaseStatuses } } });
      if (deleted.count !== 1) throw new ApplicationCaseLimitReachedException();
    }

    const { sanitizedText: vacancySanitizedText } = sanitizeDirectIdentifiers(file.sourceText);
    const applicationCase = await this.database.applicationCase.create({
      data: {
        userId,
        resumeId: input.resumeId,
        title: input.title,
        vacancySourceType: 'FILE',
        vacancySourceFileName: file.sourceFileName,
        vacancySourceText: file.sourceText,
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

  private async runSerializableTransaction<T>(callback: (transaction: Prisma.TransactionClient) => Promise<T>): Promise<T> {
    for (let attempt = 0; attempt < serializationRetryLimit; attempt += 1) {
      try {
        return await this.database.$transaction(callback, {
          isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        });
      } catch (error) {
        if (!isTransactionSerializationFailure(error) || attempt === serializationRetryLimit - 1) {
          throw error;
        }
      }
    }

    throw new Error('Serializable transaction retry limit exhausted.');
  }
}

class ApplicationCaseLimitReachedException extends HttpException {
  constructor() {
    super('Application case limit reached.', HttpStatus.TOO_MANY_REQUESTS);
  }
}

function isTransactionSerializationFailure(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2034';
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

function toApplicationCaseAnalysisSummary(record: ApplicationCaseAnalysisRecord): ApplicationCaseAnalysisSummary {
  return {
    id: record.id,
    title: record.title,
    status: record.status,
    currentStage: record.currentStage,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
    analysisRun: record.analysisRuns[0] === undefined ? null : toAnalysisRunSummary(record.analysisRuns[0]),
  };
}

function toInitialAnalysisResult(record: { id: string; applicationCaseId: string; finalMarkdown: string | null; editedFinalMarkdown: string | null; status: string }): InitialAnalysisResult {
  if (record.status !== 'SUCCEEDED' || record.finalMarkdown === null) throw new Error('Initial analysis result is not ready.');

  return { id: record.id, applicationCaseId: record.applicationCaseId, finalMarkdown: record.finalMarkdown, editedFinalMarkdown: record.editedFinalMarkdown };
}
