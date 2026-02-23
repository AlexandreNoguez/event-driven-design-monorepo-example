import type { DomainEventV1 } from '@event-pipeline/shared';

export type ProjectableEventType =
  | 'FileUploaded.v1'
  | 'FileValidated.v1'
  | 'FileRejected.v1'
  | 'ThumbnailGenerated.v1'
  | 'MetadataExtracted.v1'
  | 'ProcessingCompleted.v1';

export type ProjectableDomainEvent = {
  [K in ProjectableEventType]: DomainEventV1<K>;
}[ProjectableEventType];

export interface ProjectableEventWithRoutingKey {
  event: ProjectableDomainEvent;
  routingKey?: string;
}

export interface ProjectionTimelineSummary {
  fileId: string;
  payloadSummary: Record<string, unknown>;
}

export function isProjectableDomainEvent(value: unknown): value is ProjectableDomainEvent {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const candidate = value as Record<string, unknown>;
  if (
    candidate.kind !== 'event' ||
    typeof candidate.type !== 'string' ||
    typeof candidate.messageId !== 'string' ||
    typeof candidate.correlationId !== 'string' ||
    typeof candidate.producer !== 'string' ||
    typeof candidate.occurredAt !== 'string' ||
    typeof candidate.version !== 'number' ||
    !candidate.payload ||
    typeof candidate.payload !== 'object'
  ) {
    return false;
  }

  return isProjectableType(candidate.type) && hasFileId(candidate.payload as Record<string, unknown>);
}

export function isProjectableType(type: string): type is ProjectableEventType {
  return (
    type === 'FileUploaded.v1' ||
    type === 'FileValidated.v1' ||
    type === 'FileRejected.v1' ||
    type === 'ThumbnailGenerated.v1' ||
    type === 'MetadataExtracted.v1' ||
    type === 'ProcessingCompleted.v1'
  );
}

export function getEventFileId(event: ProjectableDomainEvent): string {
  return event.payload.fileId;
}

export function buildTimelineSummary(event: ProjectableDomainEvent): ProjectionTimelineSummary {
  switch (event.type) {
    case 'FileUploaded.v1':
      return {
        fileId: event.payload.fileId,
        payloadSummary: {
          fileName: event.payload.fileName,
          contentType: event.payload.contentType,
          sizeBytes: event.payload.sizeBytes,
          bucket: event.payload.bucket,
          objectKey: event.payload.objectKey,
        },
      };
    case 'FileValidated.v1':
      return {
        fileId: event.payload.fileId,
        payloadSummary: {
          contentType: event.payload.contentType,
          sizeBytes: event.payload.sizeBytes,
          bucket: event.payload.bucket,
          objectKey: event.payload.objectKey,
          checksum: event.payload.checksum,
        },
      };
    case 'FileRejected.v1':
      return {
        fileId: event.payload.fileId,
        payloadSummary: {
          code: event.payload.code,
          reason: event.payload.reason,
          bucket: event.payload.bucket,
          objectKey: event.payload.objectKey,
        },
      };
    case 'ThumbnailGenerated.v1':
      return {
        fileId: event.payload.fileId,
        payloadSummary: {
          thumbnailBucket: event.payload.thumbnailBucket,
          thumbnailObjectKey: event.payload.thumbnailObjectKey,
          width: event.payload.width,
          height: event.payload.height,
        },
      };
    case 'MetadataExtracted.v1':
      return {
        fileId: event.payload.fileId,
        payloadSummary: {
          metadataKeys: Object.keys(event.payload.metadata ?? {}).sort(),
          metadata: event.payload.metadata,
        },
      };
    case 'ProcessingCompleted.v1':
      return {
        fileId: event.payload.fileId,
        payloadSummary: {
          status: event.payload.status,
          completedSteps: event.payload.completedSteps,
        },
      };
  }

  return assertNever(event);
}

function hasFileId(payload: Record<string, unknown>): payload is { fileId: string } {
  return typeof payload.fileId === 'string';
}

function assertNever(value: never): never {
  throw new Error(`Unsupported projectable event: ${JSON.stringify(value)}`);
}
