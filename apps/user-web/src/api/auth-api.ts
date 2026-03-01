import axios from 'axios';
import { userWebConfig } from '../config/user-web-config';
import type {
  DemoAccountPreset,
  LoginInput,
  LoginResult,
  UserProfile,
} from '../types/auth';

interface KeycloakTokenResponse {
  access_token: string;
  refresh_token?: string;
  token_type?: string;
}

const DEMO_ACCOUNTS: DemoAccountPreset[] = [
  {
    username: 'demo-user',
    password: 'demo123',
    displayName: 'Demo User',
    roleLabel: 'User',
    email: 'demo-user@local.test',
    description: 'Local seeded account focused on the standard upload journey.',
  },
  {
    username: 'demo-admin',
    password: 'demo123',
    displayName: 'Demo Admin',
    roleLabel: 'Admin',
    email: 'demo-admin@local.test',
    description: 'Local seeded account with administrative access for future admin-web flows.',
  },
];

export function listDemoAccounts(): DemoAccountPreset[] {
  return DEMO_ACCOUNTS;
}

export async function signIn(input: LoginInput): Promise<LoginResult> {
  if (userWebConfig.authProvider === 'keycloak') {
    return signInWithKeycloak(input);
  }

  return signInWithDemo(input);
}

async function signInWithDemo(input: LoginInput): Promise<LoginResult> {
  const matchedAccount = DEMO_ACCOUNTS.find(
    (account) =>
      account.username === input.username.trim() && account.password === input.password,
  );

  if (!matchedAccount) {
    throw new Error('Invalid credentials. Use one of the seeded Keycloak demo accounts.');
  }

  const tokenResult = await exchangePasswordForToken(input);

  return {
    sessionMode: 'bearer',
    accessToken: tokenResult.accessToken,
    user: {
      ...tokenResult.user,
      authProvider: 'demo',
    },
  };
}

async function signInWithKeycloak(input: LoginInput): Promise<LoginResult> {
  const tokenResult = await exchangePasswordForToken(input);

  return {
    sessionMode: 'bearer',
    accessToken: tokenResult.accessToken,
    user: tokenResult.user,
  };
}

async function exchangePasswordForToken(
  input: LoginInput,
): Promise<{ accessToken: string; user: UserProfile }> {
  const body = new URLSearchParams({
    grant_type: 'password',
    client_id: userWebConfig.keycloakClientId,
    username: input.username.trim(),
    password: input.password,
  });

  let response;
  try {
    response = await axios.post<KeycloakTokenResponse>(buildTokenEndpoint(), body, {
      headers: {
        'content-type': 'application/x-www-form-urlencoded',
      },
      timeout: 10000,
    });
  } catch (error) {
    if (axios.isAxiosError(error)) {
      const statusCode = error.response?.status;
      const responseData =
        typeof error.response?.data === 'string'
          ? error.response.data
          : error.response?.data
            ? JSON.stringify(error.response.data)
            : error.message;

      throw new Error(
        `Keycloak login failed${statusCode ? ` (${statusCode})` : ''}. ${responseData || 'Check your local Keycloak configuration.'}`,
      );
    }

    throw error;
  }

  if (!response.data.access_token) {
    throw new Error('Keycloak did not return an access token.');
  }

  return {
    accessToken: response.data.access_token,
    user: toUserProfileFromJwt(response.data.access_token),
  };
}

function buildTokenEndpoint(): string {
  return `${userWebConfig.keycloakBaseUrl}/realms/${encodeURIComponent(userWebConfig.keycloakRealm)}/protocol/openid-connect/token`;
}

function toUserProfileFromJwt(accessToken: string): UserProfile {
  const [, payloadSegment = ''] = accessToken.split('.');
  const payload = decodeBase64UrlJson(payloadSegment) as Record<string, unknown>;
  const preferredUsername = stringOrFallback(payload.preferred_username, 'user');
  const firstName = stringOrFallback(payload.given_name, preferredUsername);
  const lastName = stringOrFallback(payload.family_name, '');
  const name = stringOrFallback(payload.name, `${firstName} ${lastName}`.trim());
  const realmAccess = isRecord(payload.realm_access) ? payload.realm_access : {};
  const roles = Array.isArray(realmAccess.roles)
    ? realmAccess.roles.filter((role): role is string => typeof role === 'string')
    : [];

  return {
    username: preferredUsername,
    firstName,
    lastName,
    displayName: name.length > 0 ? name : preferredUsername,
    email: stringOrFallback(payload.email, `${preferredUsername}@local.test`),
    roles,
    authProvider: 'keycloak',
  };
}

function decodeBase64UrlJson(value: string): unknown {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=');
  const decoded = globalThis.atob(padded);
  return JSON.parse(decoded) as unknown;
}

function stringOrFallback(value: unknown, fallback: string): string {
  return typeof value === 'string' && value.trim().length > 0 ? value : fallback;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
