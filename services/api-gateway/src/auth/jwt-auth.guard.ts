import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { AuthenticatedUser, RequestWithUser } from './auth.types';
import { KeycloakJwtVerifierService } from './keycloak-jwt-verifier.service';
import { IS_PUBLIC_KEY } from './public.decorator';

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly keycloakJwtVerifier: KeycloakJwtVerifierService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (isPublic) {
      return true;
    }

    const request = context.switchToHttp().getRequest<RequestWithUser>();
    const authorization = this.getHeader(request, 'authorization');

    if (!authorization) {
      if (this.isDevBypassEnabled()) {
        request.user = this.createBypassUser();
        return true;
      }

      throw new UnauthorizedException('Missing Authorization header.');
    }

    const token = this.extractBearerToken(authorization);
    request.user = await this.keycloakJwtVerifier.verifyAccessToken(token);
    return true;
  }

  private getHeader(request: RequestWithUser, name: string): string | undefined {
    const value = request.headers?.[name];
    if (Array.isArray(value)) {
      return value[0];
    }
    return value;
  }

  private extractBearerToken(authorization: string): string {
    const [scheme, token] = authorization.split(' ');
    if (!scheme || !token || scheme.toLowerCase() !== 'bearer') {
      throw new UnauthorizedException('Authorization header must be a Bearer token.');
    }
    return token;
  }

  private isDevBypassEnabled(): boolean {
    return (process.env.API_GATEWAY_AUTH_DEV_BYPASS ?? 'false').toLowerCase() === 'true';
  }

  private createBypassUser(): AuthenticatedUser {
    return {
      subject: 'dev-user',
      username: 'dev-user',
      email: 'dev-user@local.test',
      roles: ['user', 'admin'],
      rawClaims: {
        devBypass: true,
      },
    };
  }
}
