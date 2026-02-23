export interface AuthenticatedUser {
  subject: string;
  username: string;
  email?: string;
  tenantId?: string;
  roles: string[];
  rawClaims: Record<string, unknown>;
}

export interface JwtAccessTokenClaims extends Record<string, unknown> {
  sub: string;
  preferred_username?: string;
  email?: string;
  realm_access?: {
    roles?: string[];
  };
  resource_access?: Record<string, { roles?: string[] }>;
  tenant_id?: string;
}
