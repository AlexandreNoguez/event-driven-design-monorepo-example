import {
  Injectable,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import {
  type PasswordAuthenticator,
  type PasswordAuthenticatorInput,
} from '../../application/auth/ports/password-authenticator.port';
import { ApiGatewayConfigService } from '../config/api-gateway-config.service';

interface KeycloakTokenResponse {
  access_token?: string;
  error?: string;
  error_description?: string;
}

@Injectable()
export class KeycloakPasswordAuthenticatorService implements PasswordAuthenticator {
  constructor(private readonly config: ApiGatewayConfigService) {}

  async exchangePasswordForAccessToken(input: PasswordAuthenticatorInput): Promise<string> {
    let response: Response;

    try {
      response = await fetch(this.buildTokenEndpoint(), {
        method: 'POST',
        headers: {
          'content-type': 'application/x-www-form-urlencoded',
          accept: 'application/json',
        },
        body: new URLSearchParams({
          grant_type: 'password',
          client_id: this.config.keycloakUserWebClientId,
          username: input.username,
          password: input.password,
        }),
        signal: AbortSignal.timeout(this.config.keycloakPasswordGrantTimeoutMs),
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'unknown error';
      throw new ServiceUnavailableException(
        `Unable to reach Keycloak for password login (${message}).`,
      );
    }

    const payload = (await this.readJson(response)) as KeycloakTokenResponse;

    if (!response.ok) {
      const detail = payload.error_description ?? payload.error ?? `status ${response.status}`;
      throw new UnauthorizedException(`Invalid username or password (${detail}).`);
    }

    if (!payload.access_token) {
      throw new ServiceUnavailableException('Keycloak did not return an access token.');
    }

    return payload.access_token;
  }

  private buildTokenEndpoint(): string {
    return `${this.config.keycloakInternalUrl}/realms/${encodeURIComponent(this.config.keycloakRealm)}/protocol/openid-connect/token`;
  }

  private async readJson(response: Response): Promise<unknown> {
    try {
      return (await response.json()) as unknown;
    } catch {
      return {};
    }
  }
}
