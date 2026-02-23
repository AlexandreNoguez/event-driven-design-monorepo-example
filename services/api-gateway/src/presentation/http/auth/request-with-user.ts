import type { AuthenticatedUser } from '../../../domain/auth/authenticated-user';

export interface RequestWithUser {
  headers?: Record<string, string | string[] | undefined>;
  user?: AuthenticatedUser;
}
