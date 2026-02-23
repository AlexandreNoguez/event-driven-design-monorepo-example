export interface UploadRequestedCommandPayload {
  fileId: string;
  fileName: string;
  contentType: string;
  sizeBytes: number;
  userId?: string;
  tenantId?: string;
}

export interface UploadRequestedCommandEnvelope {
  messageId: string;
  kind: 'command';
  type: 'UploadRequested.v1';
  occurredAt: string;
  correlationId: string;
  causationId?: string;
  producer: string;
  version: number;
  payload: UploadRequestedCommandPayload;
}

export interface FileUploadedEventPayload extends UploadRequestedCommandPayload {
  bucket: string;
  objectKey: string;
}

export interface FileUploadedEventEnvelope {
  messageId: string;
  kind: 'event';
  type: 'FileUploaded.v1';
  occurredAt: string;
  correlationId: string;
  causationId?: string;
  producer: string;
  version: number;
  payload: FileUploadedEventPayload;
}

export interface PersistUploadAndOutboxInput {
  command: UploadRequestedCommandEnvelope;
  fileUploadedEvent: FileUploadedEventEnvelope;
  routingKey: string;
}

export interface OutboxPendingEvent {
  eventId: string;
  routingKey: string;
  envelope: FileUploadedEventEnvelope;
}

interface FileUploadedEnvelopeFactoryOptions {
  bucket: string;
  objectKeyPrefix?: string;
}

export function createFileUploadedEventEnvelope(
  command: UploadRequestedCommandEnvelope,
  options: FileUploadedEnvelopeFactoryOptions,
): FileUploadedEventEnvelope {
  const bucket = normalizeRequiredString(options.bucket, 'bucket');
  const objectKey = buildObjectKey(
    command.payload.fileId,
    command.payload.fileName,
    options.objectKeyPrefix,
  );

  return {
    messageId: deriveFileUploadedEventId(command.messageId),
    kind: 'event',
    type: 'FileUploaded.v1',
    occurredAt: new Date().toISOString(),
    correlationId: command.correlationId,
    causationId: command.messageId,
    producer: 'upload-service',
    version: 1,
    payload: {
      fileId: command.payload.fileId,
      fileName: command.payload.fileName,
      contentType: command.payload.contentType,
      sizeBytes: command.payload.sizeBytes,
      userId: command.payload.userId,
      tenantId: command.payload.tenantId,
      bucket,
      objectKey,
    },
  };
}

export function deriveFileUploadedEventId(commandMessageId: string): string {
  return `${commandMessageId}:FileUploaded.v1`;
}

export function buildObjectKey(
  fileId: string,
  fileName: string,
  objectKeyPrefix = 'raw',
): string {
  const prefix = objectKeyPrefix.trim() || 'raw';
  const safeName = sanitizeFileName(fileName);
  return `${prefix}/${fileId}/${safeName}`;
}

export function sanitizeFileName(fileName: string): string {
  const normalized = fileName
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');

  return normalized || 'file.bin';
}

function normalizeRequiredString(value: string | undefined, fieldName: string): string {
  if (!value || value.trim().length === 0) {
    throw new Error(`Missing required value: ${fieldName}`);
  }

  return value.trim();
}
