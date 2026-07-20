import {
  UnauthorizedException,
  createParamDecorator,
  type CanActivate,
  type ExecutionContext,
  Injectable,
  SetMetadata,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { fromNodeHeaders } from 'better-auth/node';
import type { Request } from 'express';

import { auth } from './auth.config.js';

const IS_PUBLIC_ENDPOINT = 'isPublicEndpoint';

export const Public = (): ReturnType<typeof SetMetadata> =>
  SetMetadata(IS_PUBLIC_ENDPOINT, true);

export type AuthenticatedSession = NonNullable<
  Awaited<ReturnType<typeof auth.api.getSession>>
>;

type AuthenticatedRequest = Request & {
  authSession?: AuthenticatedSession;
};

@Injectable()
export class AuthenticationGuard implements CanActivate {
  private readonly reflector = new Reflector();

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_ENDPOINT, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (isPublic) {
      return true;
    }

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const session = await auth.api.getSession({
      headers: fromNodeHeaders(request.headers),
    });

    if (session === null) {
      throw new UnauthorizedException();
    }

    request.authSession = session;

    return true;
  }
}

export const CurrentSession = createParamDecorator(
  (_: unknown, context: ExecutionContext): AuthenticatedSession => {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();

    if (request.authSession === undefined) {
      throw new UnauthorizedException();
    }

    return request.authSession;
  },
);
