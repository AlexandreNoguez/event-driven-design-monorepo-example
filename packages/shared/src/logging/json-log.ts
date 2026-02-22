export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface SerializedError {
  name: string;
  message: string;
  stack?: string;
}

export interface JsonLogEntry {
  timestamp: string;
  level: LogLevel;
  service: string;
  message: string;
  correlationId: string;
  causationId?: string;
  messageId?: string;
  messageType?: string;
  routingKey?: string;
  queue?: string;
  fileId?: string;
  userId?: string;
  metadata?: Record<string, unknown>;
  error?: SerializedError;
}

export interface CreateJsonLogEntryInput {
  level: LogLevel;
  service: string;
  message: string;
  correlationId: string;
  causationId?: string;
  messageId?: string;
  messageType?: string;
  routingKey?: string;
  queue?: string;
  fileId?: string;
  userId?: string;
  metadata?: Record<string, unknown>;
  error?: unknown;
  timestamp?: string;
}

export function serializeError(error: unknown): SerializedError | undefined {
  if (error == null) {
    return undefined;
  }

  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      stack: error.stack,
    };
  }

  if (typeof error === 'string') {
    return {
      name: 'Error',
      message: error,
    };
  }

  return {
    name: 'UnknownError',
    message: safeSerializeUnknown(error),
  };
}

function safeSerializeUnknown(value: unknown): string {
  try {
    const serialized = JSON.stringify(value);
    if (serialized !== undefined) {
      return serialized;
    }
  } catch {
    return String(value);
  }

  return String(value);
}

export function createJsonLogEntry(input: CreateJsonLogEntryInput): JsonLogEntry {
  return {
    timestamp: input.timestamp ?? new Date().toISOString(),
    level: input.level,
    service: input.service,
    message: input.message,
    correlationId: input.correlationId,
    causationId: input.causationId,
    messageId: input.messageId,
    messageType: input.messageType,
    routingKey: input.routingKey,
    queue: input.queue,
    fileId: input.fileId,
    userId: input.userId,
    metadata: input.metadata,
    error: serializeError(input.error),
  };
}
