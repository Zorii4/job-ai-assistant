import { BadRequestException, Body, Controller, Delete, Get } from '@nestjs/common';

import { DeleteAccountRequestSchema } from '@job-ai-assistant/contracts';

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

  @Delete('me')
  async deleteCurrentUser(@CurrentSession() session: AuthenticatedSession, @Body() body: unknown) {
    const parsed = DeleteAccountRequestSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException('Account deletion must be confirmed.');
    }

    await prisma.user.delete({ where: { id: session.user.id } });
    return { deleted: true };
  }
}
