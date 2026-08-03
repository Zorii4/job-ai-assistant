import { BadRequestException } from '@nestjs/common';

import {
  CreateApplicationCaseFileRequestSchema,
  CreateApplicationCaseRequestSchema,
  UpdateArtifactRequestSchema,
  type CreateApplicationCaseFileRequest,
  type CreateApplicationCaseRequest,
  type UpdateArtifactRequest,
} from '@job-ai-assistant/contracts';

export function parseCreateApplicationCaseRequest(input: unknown): CreateApplicationCaseRequest {
  const result = CreateApplicationCaseRequestSchema.safeParse(input);

  if (!result.success) {
    throw new BadRequestException();
  }

  return result.data;
}

export function parseCreateApplicationCaseFileRequest(input: unknown): CreateApplicationCaseFileRequest {
  const result = CreateApplicationCaseFileRequestSchema.safeParse(input);

  if (!result.success) {
    throw new BadRequestException();
  }

  return result.data;
}

export function parseApplicationCaseId(input: string): string {
  return parseEntityId(input);
}

export function parseAnalysisRunId(input: string): string {
  return parseEntityId(input);
}

export function parseArtifactId(input: string): string {
  return parseEntityId(input);
}

export function parseUpdateArtifactRequest(input: unknown): UpdateArtifactRequest {
  const result = UpdateArtifactRequestSchema.safeParse(input);

  if (!result.success) {
    throw new BadRequestException();
  }

  return result.data;
}

function parseEntityId(input: string): string {
  if (input.trim().length === 0 || input.length > 128) {
    throw new BadRequestException();
  }

  return input;
}
