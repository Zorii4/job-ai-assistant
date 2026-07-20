import { Controller, Get } from '@nestjs/common';

import {
  API_SCHEMA_VERSION,
  HealthResponseSchema,
  type HealthResponse,
} from '@job-ai-assistant/contracts';

@Controller('health')
export class HealthController {
  @Get()
  getHealth(): HealthResponse {
    return HealthResponseSchema.parse({
      schemaVersion: API_SCHEMA_VERSION,
      status: 'ok',
    });
  }
}
