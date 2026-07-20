import { Controller, Get } from '@nestjs/common';

import {
  API_SCHEMA_VERSION,
  HealthResponseSchema,
  type HealthResponse,
} from '@job-ai-assistant/contracts';

import { Public } from '../auth/authentication.guard.js';

@Controller('health')
export class HealthController {
  @Get()
  @Public()
  getHealth(): HealthResponse {
    return HealthResponseSchema.parse({
      schemaVersion: API_SCHEMA_VERSION,
      status: 'ok',
    });
  }
}
