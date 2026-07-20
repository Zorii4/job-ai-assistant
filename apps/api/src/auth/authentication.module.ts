import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';

import { AuthenticationGuard } from './authentication.guard.js';

@Module({
  providers: [
    AuthenticationGuard,
    {
      provide: APP_GUARD,
      useExisting: AuthenticationGuard,
    },
  ],
})
export class AuthenticationModule {}
