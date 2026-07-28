import { Module } from '@nestjs/common';

import { AuthenticationModule } from './auth/authentication.module.js';
import { CurrentUserController } from './auth/current-user.controller.js';
import { PrismaModule } from './database/prisma.module.js';
import { HealthController } from './health/health.controller.js';
import { ResumesController } from './resumes/resumes.controller.js';
import { ResumesService } from './resumes/resumes.service.js';

@Module({
  imports: [PrismaModule, AuthenticationModule],
  controllers: [HealthController, CurrentUserController, ResumesController],
  providers: [ResumesService],
})
export class AppModule {}
