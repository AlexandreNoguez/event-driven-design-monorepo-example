import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { createJsonLogEntry } from '@event-pipeline/shared';

interface HttpRequestLike {
  headers: Record<string, string | string[] | undefined>;
  originalUrl?: string;
  url?: string;
  method: string;
}

interface HttpResponseLike {
  setHeader(name: string, value: string): void;
  status(code: number): HttpResponseLike;
  json(body: unknown): void;
}

interface ErrorResponseBody {
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
  statusCode: number;
  path: string;
  method: string;
  timestamp: string;
  correlationId: string;
}

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const request = ctx.getRequest<HttpRequestLike>();
    const response = ctx.getResponse<HttpResponseLike>();

    const correlationId = this.getCorrelationId(request);
    const timestamp = new Date().toISOString();

    const normalized = this.normalizeException(exception);
    const body: ErrorResponseBody = {
      error: {
        code: normalized.code,
        message: normalized.message,
        ...(normalized.details === undefined ? {} : { details: normalized.details }),
      },
      statusCode: normalized.statusCode,
      path: request.originalUrl ?? request.url ?? '/',
      method: request.method,
      timestamp,
      correlationId,
    };

    response.setHeader('x-correlation-id', correlationId);
    response.status(normalized.statusCode).json(body);

    const level = normalized.statusCode >= 500 ? 'error' : 'warn';
    const logLine = JSON.stringify(createJsonLogEntry({
      level,
      service: 'api-gateway',
      message: 'HTTP request failed.',
      correlationId,
      metadata: {
        method: body.method,
        path: body.path,
        statusCode: body.statusCode,
        errorCode: body.error.code,
      },
      error: normalized.statusCode >= 500 ? exception : undefined,
    }));

    if (level === 'error') {
      this.logger.error(logLine);
    } else {
      this.logger.warn(logLine);
    }
  }

  private getCorrelationId(request: HttpRequestLike): string {
    const header = request.headers['x-correlation-id'];
    if (Array.isArray(header) && header[0]?.trim()) {
      return header[0].trim();
    }
    if (typeof header === 'string' && header.trim()) {
      return header.trim();
    }
    return globalThis.crypto?.randomUUID?.() ?? `req-${Date.now()}`;
  }

  private normalizeException(exception: unknown): {
    statusCode: number;
    code: string;
    message: string;
    details?: unknown;
  } {
    if (exception instanceof HttpException) {
      const statusCode = exception.getStatus();
      const response = exception.getResponse();

      if (typeof response === 'string') {
        return {
          statusCode,
          code: this.defaultCodeForStatus(statusCode),
          message: response,
        };
      }

      if (response && typeof response === 'object') {
        const body = response as Record<string, unknown>;
        const message = this.extractMessage(body.message) ?? exception.message ?? 'Request failed.';
        const code = typeof body.errorCode === 'string'
          ? body.errorCode
          : typeof body.code === 'string'
            ? body.code
            : this.defaultCodeForStatus(statusCode);
        const details = body.details ?? (Array.isArray(body.message) ? body.message : undefined);

        return { statusCode, code, message, details };
      }

      return {
        statusCode,
        code: this.defaultCodeForStatus(statusCode),
        message: exception.message || 'Request failed.',
      };
    }

    return {
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      code: 'INTERNAL_SERVER_ERROR',
      message: 'Unexpected server error.',
    };
  }

  private extractMessage(value: unknown): string | undefined {
    if (typeof value === 'string' && value.trim()) {
      return value;
    }
    if (Array.isArray(value) && value.length > 0) {
      const first = value.find((item) => typeof item === 'string' && item.trim());
      if (typeof first === 'string') {
        return first;
      }
    }
    return undefined;
  }

  private defaultCodeForStatus(statusCode: number): string {
    switch (statusCode) {
      case HttpStatus.BAD_REQUEST:
        return 'BAD_REQUEST';
      case HttpStatus.UNAUTHORIZED:
        return 'UNAUTHORIZED';
      case HttpStatus.FORBIDDEN:
        return 'FORBIDDEN';
      case HttpStatus.NOT_FOUND:
        return 'NOT_FOUND';
      case HttpStatus.CONFLICT:
        return 'CONFLICT';
      case HttpStatus.UNPROCESSABLE_ENTITY:
        return 'UNPROCESSABLE_ENTITY';
      case HttpStatus.TOO_MANY_REQUESTS:
        return 'TOO_MANY_REQUESTS';
      default:
        return statusCode >= 500 ? 'INTERNAL_SERVER_ERROR' : 'HTTP_ERROR';
    }
  }
}
