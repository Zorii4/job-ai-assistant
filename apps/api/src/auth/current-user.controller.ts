import { Controller, Get } from '@nestjs/common';

import { CurrentSession, type AuthenticatedSession } from './authentication.guard.js';
import { prisma } from '../database/prisma.service.js';
import { getUsagePolicy } from '../usage/usage-policy.js';

@Controller('users')
export class CurrentUserController {
  @Get('me')
  async getCurrentUser(@CurrentSession() session: AuthenticatedSession) {
    const user = await prisma.user.findUniqueOrThrow({
      where: { id: session.user.id },
      select: { planCode: true },
    });

    return {
      user: {
        id: session.user.id,
        name: session.user.name,
        email: session.user.email,
        emailVerified: session.user.emailVerified,
      },
      usage: {
        planCode: user.planCode,
        ...getUsagePolicy(user.planCode),
      },
    };
  }
}
