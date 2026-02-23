import { Injectable, InternalServerErrorException, UnauthorizedException } from '@nestjs/common';
import jwt, { type JwtPayload } from 'jsonwebtoken';
import jwkToPem from 'jwk-to-pem';
import type { AccessTokenVerifier } from '../../application/auth/ports/access-token-verifier.port';
import type { AuthenticatedUser, JwtAccessTokenClaims } from '../../domain/auth/authenticated-user';
import { ApiGatewayConfigService } from '../config/api-gateway-config.service';

interface JsonWebKey {
  kid?: string;
  kty: string;
  use?: string;
  alg?: string;
  n?: string;
  e?: string;
  x5c?: string[];
  [key: string]: unknown;
}

interface JwksResponse {
  keys?: JsonWebKey[];
}

@Injectable()
export class KeycloakAccessTokenVerifierService implements AccessTokenVerifier {
  private readonly jwksCache = new Map<string, { expiresAt: number; keys: JsonWebKey[] }>();

  constructor(private readonly config: ApiGatewayConfigService) {}

  async verifyAccessToken(token: string): Promise<AuthenticatedUser> {
    const issuer = this.requiredIssuer();
    const audience = this.config.jwtAudience;
    const jwksUrl = this.resolveJwksUrl(issuer);

    const decoded = jwt.decode(token, { complete: true });
    if (!decoded || typeof decoded === 'string' || !decoded.header) {
      throw new UnauthorizedException('Invalid bearer token.');
    }

    const kid = typeof decoded.header.kid === 'string' ? decoded.header.kid : undefined;
    if (!kid) {
      throw new UnauthorizedException('JWT header is missing "kid".');
    }

    const jwk = await this.findJwk(jwksUrl, kid);
    const pem = jwkToPem(jwk as never);

    let verified: string | JwtPayload;
    try {
      verified = jwt.verify(token, pem, {
        algorithms: ['RS256', 'RS384', 'RS512'],
        issuer,
        audience,
      });
    } catch (error) {
      throw new UnauthorizedException(
        `JWT validation failed: ${error instanceof Error ? error.message : 'unknown error'}`,
      );
    }

    if (typeof verified === 'string') {
      throw new UnauthorizedException('Unexpected JWT payload format.');
    }

    const claims = verified as JwtPayload & JwtAccessTokenClaims;

    if (!claims.sub || typeof claims.sub !== 'string') {
      throw new UnauthorizedException('JWT payload is missing "sub".');
    }

    return this.toAuthenticatedUser(claims);
  }

  private requiredIssuer(): string {
    const issuer = this.config.jwtIssuerUrl;
    if (issuer) {
      return issuer;
    }
    throw new InternalServerErrorException('Missing required environment variable: JWT_ISSUER_URL');
  }

  private resolveJwksUrl(issuer: string): string {
    const explicit = this.config.jwtJwksUrl;
    if (explicit) {
      return explicit;
    }

    return `${issuer.replace(/\/$/, '')}/protocol/openid-connect/certs`;
  }

  private async findJwk(jwksUrl: string, kid: string): Promise<JsonWebKey> {
    const keys = await this.loadJwks(jwksUrl);
    const match = keys.find((key) => key.kid === kid);

    if (!match) {
      this.jwksCache.delete(jwksUrl);
      const refreshed = await this.loadJwks(jwksUrl);
      const refreshedMatch = refreshed.find((key) => key.kid === kid);
      if (refreshedMatch) {
        return refreshedMatch;
      }
      throw new UnauthorizedException(`JWK with kid "${kid}" not found.`);
    }

    return match;
  }

  private async loadJwks(jwksUrl: string): Promise<JsonWebKey[]> {
    const now = Date.now();
    const cached = this.jwksCache.get(jwksUrl);
    if (cached && cached.expiresAt > now) {
      return cached.keys;
    }

    const response = await fetch(jwksUrl, {
      headers: {
        accept: 'application/json',
      },
    });

    if (!response.ok) {
      throw new UnauthorizedException(`Unable to fetch JWKS (${response.status}).`);
    }

    const data = (await response.json()) as JwksResponse;
    const keys = Array.isArray(data.keys) ? data.keys : [];

    if (keys.length === 0) {
      throw new UnauthorizedException('JWKS endpoint returned no keys.');
    }

    const ttl = this.resolveJwksCacheTtlMs();
    this.jwksCache.set(jwksUrl, {
      keys,
      expiresAt: now + ttl,
    });

    return keys;
  }

  private resolveJwksCacheTtlMs(): number {
    return this.config.jwtJwksCacheTtlMs;
  }

  private toAuthenticatedUser(claims: JwtAccessTokenClaims): AuthenticatedUser {
    const realmRoles = Array.isArray(claims.realm_access?.roles) ? claims.realm_access.roles : [];
    const resourceRoles = Object.values(claims.resource_access ?? {})
      .flatMap((entry) => (Array.isArray(entry.roles) ? entry.roles : []))
      .filter((value): value is string => typeof value === 'string');

    const roles = Array.from(new Set([...realmRoles, ...resourceRoles]));

    const rawClaims: Record<string, unknown> = { ...claims };
    const username =
      (typeof claims.preferred_username === 'string' && claims.preferred_username) ||
      (typeof claims.email === 'string' && claims.email) ||
      claims.sub;

    const tenantId =
      typeof claims.tenant_id === 'string'
        ? claims.tenant_id
        : typeof rawClaims.tenantId === 'string'
          ? rawClaims.tenantId
          : undefined;

    return {
      subject: claims.sub,
      username,
      email: typeof claims.email === 'string' ? claims.email : undefined,
      tenantId,
      roles,
      rawClaims,
    };
  }
}
