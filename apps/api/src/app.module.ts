import { Module } from '@nestjs/common';

import { AuthenticationModule } from './auth/authentication.module.js';
import { ApplicationsController } from './applications/applications.controller.js';
import { ApplicationsService } from './applications/applications.service.js';
import { CurrentUserController } from './auth/current-user.controller.js';
import { PrismaModule } from './database/prisma.module.js';
import { HealthController } from './health/health.controller.js';
import { JobsService } from './jobs/jobs.service.js';
import { ResumesController } from './resumes/resumes.controller.js';
import { ResumesService } from './resumes/resumes.service.js';

@Module({
  imports: [PrismaModule, AuthenticationModule],
  controllers: [HealthController, CurrentUserController, ResumesController, ApplicationsController],
  providers: [ResumesService, ApplicationsService, JobsService],
})
export class AppModule {}
