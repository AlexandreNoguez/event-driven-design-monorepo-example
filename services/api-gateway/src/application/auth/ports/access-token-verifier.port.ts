import type { AuthenticatedUser } from '../../../domain/auth/authenticated-user';

export const ACCESS_TOKEN_VERIFIER = Symbol('ACCESS_TOKEN_VERIFIER');

export interface AccessTokenVerifier {
  verifyAccessToken(token: string): Promise<AuthenticatedUser>;
}
