import {
  BadRequestException,
  Inject,
  Injectable,
} from '@nestjs/common';
import {
  ACCESS_TOKEN_VERIFIER,
  type AccessTokenVerifier,
} from './ports/access-token-verifier.port';
import {
  PASSWORD_AUTHENTICATOR,
  type PasswordAuthenticator,
} from './ports/password-authenticator.port';
import type { AuthenticatedUser } from '../../domain/auth/authenticated-user';

export interface SignInCommand {
  username?: string;
  password?: string;
}

export interface SignInResult {
  sessionMode: 'bearer';
  accessToken: string;
  user: {
    username: string;
    firstName: string;
    lastName: string;
    displayName: string;
    email: string;
    roles: string[];
    authProvider: 'keycloak';
  };
}

@Injectable()
export class SignInApplicationService {
  constructor(
    @Inject(PASSWORD_AUTHENTICATOR)
    private readonly passwordAuthenticator: PasswordAuthenticator,
    @Inject(ACCESS_TOKEN_VERIFIER)
    private readonly accessTokenVerifier: AccessTokenVerifier,
  ) {}

  async signIn(command: SignInCommand): Promise<SignInResult> {
    const username = command.username?.trim() ?? '';
    const password = command.password ?? '';

    if (username.length === 0 || password.length === 0) {
      throw new BadRequestException('Username and password are required.');
    }

    const accessToken = await this.passwordAuthenticator.exchangePasswordForAccessToken({
      username,
      password,
    });
    const user = await this.accessTokenVerifier.verifyAccessToken(accessToken);

    return {
      sessionMode: 'bearer',
      accessToken,
      user: this.toUserPayload(user),
    };
  }

  private toUserPayload(user: AuthenticatedUser): SignInResult['user'] {
    const claims = user.rawClaims;
    const firstName = this.stringOrFallback(claims.given_name, user.username);
    const lastName = this.stringOrFallback(claims.family_name, '');
    const displayName = this.stringOrFallback(
      claims.name,
      [firstName, lastName].filter((value) => value.length > 0).join(' ') || user.username,
    );

    return {
      username: user.username,
      firstName,
      lastName,
      displayName,
      email: this.stringOrFallback(user.email, `${user.username}@local.test`),
      roles: user.roles,
      authProvider: 'keycloak',
    };
  }

  private stringOrFallback(value: unknown, fallback: string): string {
    return typeof value === 'string' && value.trim().length > 0 ? value : fallback;
  }
}
