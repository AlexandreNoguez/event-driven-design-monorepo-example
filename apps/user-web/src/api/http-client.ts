import axios, {
  AxiosError,
  type AxiosHeaders,
  type AxiosRequestConfig,
} from 'axios';
import { userWebConfig } from '../config/user-web-config';
import type { SessionMode } from '../types/auth';

export interface ApiSession {
  isAuthenticated: boolean;
  sessionMode: SessionMode;
  accessToken: string;
  correlationPrefix: string;
}

export class ApiRequestError extends Error {
  constructor(
    message: string,
    readonly statusCode: number,
    readonly responseBody: string,
  ) {
    super(message);
    this.name = 'ApiRequestError';
  }
}

const apiClient = axios.create({
  baseURL: userWebConfig.apiBaseUrl,
  timeout: 15000,
});

export async function requestJson<TResponse>(
  path: string,
  session: ApiSession,
  init: AxiosRequestConfig = {},
): Promise<TResponse> {
  try {
    const response = await apiClient.request<TResponse>({
      url: path,
      ...init,
      headers: buildHeaders(session, init.headers),
    });

    return response.data;
  } catch (error) {
    throw toApiRequestError(error);
  }
}

export function buildCorrelationId(prefix: string): string {
  const safePrefix = prefix.trim().length > 0 ? prefix.trim() : 'user-web';
  const randomPart = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}`;
  return `${safePrefix}-${randomPart}`;
}

function buildHeaders(
  session: ApiSession,
  headers: AxiosRequestConfig['headers'],
): AxiosHeaders {
  const result = new axios.AxiosHeaders();

  if (headers && typeof headers === 'object') {
    for (const [key, value] of Object.entries(headers)) {
      if (value !== undefined && value !== null) {
        result.set(key, String(value));
      }
    }
  }

  if (!result.has('content-type')) {
    result.set('content-type', 'application/json');
  }

  if (
    session.isAuthenticated &&
    session.sessionMode === 'bearer' &&
    session.accessToken.trim().length > 0
  ) {
    result.set('authorization', `Bearer ${session.accessToken.trim()}`);
  }

  if (!result.has('x-correlation-id')) {
    result.set('x-correlation-id', buildCorrelationId(session.correlationPrefix));
  }

  return result;
}

function toApiRequestError(error: unknown): ApiRequestError {
  if (axios.isAxiosError(error)) {
    const statusCode = error.response?.status ?? 500;
    const responseBody =
      typeof error.response?.data === 'string'
        ? error.response.data
        : error.response?.data
          ? JSON.stringify(error.response.data)
          : error.message;

    return new ApiRequestError(
      `Request failed with status ${statusCode}`,
      statusCode,
      responseBody,
    );
  }

  if (error instanceof Error) {
    return new ApiRequestError(error.message, 500, error.message);
  }

  return new ApiRequestError('Unexpected request failure.', 500, 'Unexpected request failure.');
}

export function toFriendlyHttpError(error: unknown, fallbackMessage: string): string {
  if (error instanceof ApiRequestError) {
    return `${fallbackMessage} (${error.statusCode}). ${error.responseBody || 'The API did not provide more details.'}`;
  }

  if (isAxiosErrorWithMessage(error)) {
    return error.message;
  }

  if (error instanceof Error) {
    return error.message;
  }

  return fallbackMessage;
}

function isAxiosErrorWithMessage(error: unknown): error is AxiosError {
  return axios.isAxiosError(error);
}
