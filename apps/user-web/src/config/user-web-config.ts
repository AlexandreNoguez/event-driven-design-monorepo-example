import type { AuthProvider } from '../types/auth';

export interface UserWebConfig {
  apiBaseUrl: string;
  authProvider: AuthProvider;
  appPort: number;
  uploadPollingIntervalMs: number;
}

export const userWebConfig: UserWebConfig = {
  apiBaseUrl: normalizeUrl(import.meta.env.VITE_API_BASE_URL) ?? 'http://localhost:3000',
  authProvider: parseAuthProvider(import.meta.env.VITE_AUTH_PROVIDER),
  appPort: parsePort(import.meta.env.VITE_USER_WEB_PORT, 5173),
  uploadPollingIntervalMs: parsePort(import.meta.env.VITE_UPLOAD_POLLING_INTERVAL_MS, 5000),
};

function parseAuthProvider(value: string | undefined): AuthProvider {
  if (value === 'demo') {
    return 'demo';
  }

  return 'keycloak';
}

function parsePort(value: string | undefined, fallback: number): number {
  if (!value) {
    return fallback;
  }

  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function normalizeUrl(value: string | undefined): string | undefined {
  if (!value) {
    return undefined;
  }

  const normalized = value.trim().replace(/\/+$/, '');
  return normalized.length > 0 ? normalized : undefined;
}
