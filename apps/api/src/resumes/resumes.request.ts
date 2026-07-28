import { BadRequestException } from '@nestjs/common';

import {
  CreateResumeFileRequestSchema,
  CreateResumeRequestSchema,
  UpdateSanitizedResumeRequestSchema,
  type CreateResumeFileRequest,
  type CreateResumeRequest,
  type UpdateSanitizedResumeRequest,
} from '@job-ai-assistant/contracts';

export function parseResumeRequest(input: unknown): CreateResumeRequest {
  const result = CreateResumeRequestSchema.safeParse(input);

  if (!result.success) {
    throw new BadRequestException();
  }

  return result.data;
}

export function parseResumeId(input: string): string {
  if (input.trim().length === 0 || input.length > 128) {
    throw new BadRequestException();
  }

  return input;
}

export function parseResumeFileRequest(input: unknown): CreateResumeFileRequest {
  const result = CreateResumeFileRequestSchema.safeParse(input);

  if (!result.success) {
    throw new BadRequestException();
  }

  return result.data;
}

export function parseUpdateSanitizedResumeRequest(input: unknown): UpdateSanitizedResumeRequest {
  const result = UpdateSanitizedResumeRequestSchema.safeParse(input);

  if (!result.success) {
    throw new BadRequestException();
  }

  return result.data;
}
