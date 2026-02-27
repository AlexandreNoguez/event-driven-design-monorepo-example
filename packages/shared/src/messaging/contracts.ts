import { MESSAGE_EXCHANGES } from '../standards.js';
import type { CommandEnvelope, EventEnvelope } from './envelope.js';

export type CommandTypeV1 = 'UploadRequested.v1' | 'ReprocessFileRequested.v1';

export type EventTypeV1 =
  | 'FileUploaded.v1'
  | 'FileValidated.v1'
  | 'FileRejected.v1'
  | 'ThumbnailGenerated.v1'
  | 'MetadataExtracted.v1'
  | 'ProcessingCompleted.v1'
  | 'DlqRedriveCompleted.v1';

export type MessageTypeV1 = CommandTypeV1 | EventTypeV1;

export type CommandRoutingKeyV1 = 'commands.upload.requested.v1' | 'commands.file.reprocess.v1';

export type EventRoutingKeyV1 =
  | 'files.uploaded.v1'
  | 'files.validated.v1'
  | 'files.rejected.v1'
  | 'thumbnails.generated.v1'
  | 'metadata.extracted.v1'
  | 'processing.completed.v1'
  | 'operations.dlq.redrive.completed.v1';

export interface FileActorRef {
  userId?: string;
  tenantId?: string;
}

export interface FileStorageRef {
  bucket: string;
  objectKey: string;
}

export interface UploadRequestedPayload extends FileActorRef {
  fileId: string;
  fileName: string;
  contentType: string;
  sizeBytes: number;
}

export interface ReprocessFileRequestedPayload extends FileActorRef {
  fileId: string;
  reason?: string;
}

export interface FileUploadedPayload extends FileActorRef, FileStorageRef {
  fileId: string;
  fileName: string;
  contentType: string;
  sizeBytes: number;
}

export interface FileValidatedPayload extends FileActorRef, FileStorageRef {
  fileId: string;
  contentType: string;
  sizeBytes: number;
  checksum?: string;
}

export interface FileRejectedPayload extends FileActorRef, FileStorageRef {
  fileId: string;
  code: string;
  reason: string;
}

export interface ThumbnailGeneratedPayload extends FileActorRef {
  fileId: string;
  thumbnailBucket: string;
  thumbnailObjectKey: string;
  width?: number;
  height?: number;
}

export interface MetadataExtractedPayload extends FileActorRef {
  fileId: string;
  metadata: Record<string, unknown>;
}

export interface ProcessingCompletedPayload extends FileActorRef {
  fileId: string;
  status: 'completed' | 'failed';
  completedSteps: string[];
}

export interface DlqRedriveCompletedPayload {
  operationCorrelationId: string;
  queue: string;
  mainQueue: string;
  retryExchange: string;
  requested: number;
  fetched: number;
  moved: number;
  failed: number;
  requestedByUserId: string;
  requestedByUserName: string;
  failures: Array<{
    index: number;
    reason: string;
  }>;
}

export interface CommandPayloadMapV1 {
  'UploadRequested.v1': UploadRequestedPayload;
  'ReprocessFileRequested.v1': ReprocessFileRequestedPayload;
}

export interface EventPayloadMapV1 {
  'FileUploaded.v1': FileUploadedPayload;
  'FileValidated.v1': FileValidatedPayload;
  'FileRejected.v1': FileRejectedPayload;
  'ThumbnailGenerated.v1': ThumbnailGeneratedPayload;
  'MetadataExtracted.v1': MetadataExtractedPayload;
  'ProcessingCompleted.v1': ProcessingCompletedPayload;
  'DlqRedriveCompleted.v1': DlqRedriveCompletedPayload;
}

export const COMMAND_ROUTING_KEYS_V1: { [K in CommandTypeV1]: CommandRoutingKeyV1 } = {
  'UploadRequested.v1': 'commands.upload.requested.v1',
  'ReprocessFileRequested.v1': 'commands.file.reprocess.v1',
};

export const EVENT_ROUTING_KEYS_V1: { [K in EventTypeV1]: EventRoutingKeyV1 } = {
  'FileUploaded.v1': 'files.uploaded.v1',
  'FileValidated.v1': 'files.validated.v1',
  'FileRejected.v1': 'files.rejected.v1',
  'ThumbnailGenerated.v1': 'thumbnails.generated.v1',
  'MetadataExtracted.v1': 'metadata.extracted.v1',
  'ProcessingCompleted.v1': 'processing.completed.v1',
  'DlqRedriveCompleted.v1': 'operations.dlq.redrive.completed.v1',
};

export type MessageCatalogEntryV1 =
  | {
      kind: 'command';
      type: CommandTypeV1;
      exchange: typeof MESSAGE_EXCHANGES.commands;
      routingKey: CommandRoutingKeyV1;
      producer: string;
      consumers: string[];
      status: 'implemented' | 'planned';
    }
  | {
      kind: 'event';
      type: EventTypeV1;
      exchange: typeof MESSAGE_EXCHANGES.events;
      routingKey: EventRoutingKeyV1;
      producer: string;
      consumers: string[];
      status: 'implemented' | 'planned';
    };

export const MESSAGE_CATALOG_V1: Record<MessageTypeV1, MessageCatalogEntryV1> = {
  'UploadRequested.v1': {
    kind: 'command',
    type: 'UploadRequested.v1',
    exchange: MESSAGE_EXCHANGES.commands,
    routingKey: COMMAND_ROUTING_KEYS_V1['UploadRequested.v1'],
    producer: 'api-gateway',
    consumers: ['upload-service'],
    status: 'implemented',
  },
  'ReprocessFileRequested.v1': {
    kind: 'command',
    type: 'ReprocessFileRequested.v1',
    exchange: MESSAGE_EXCHANGES.commands,
    routingKey: COMMAND_ROUTING_KEYS_V1['ReprocessFileRequested.v1'],
    producer: 'api-gateway',
    consumers: ['upload-service (handler pending)'],
    status: 'planned',
  },
  'FileUploaded.v1': {
    kind: 'event',
    type: 'FileUploaded.v1',
    exchange: MESSAGE_EXCHANGES.events,
    routingKey: EVENT_ROUTING_KEYS_V1['FileUploaded.v1'],
    producer: 'upload-service',
    consumers: ['validator-service', 'projection-service', 'audit-service'],
    status: 'implemented',
  },
  'FileValidated.v1': {
    kind: 'event',
    type: 'FileValidated.v1',
    exchange: MESSAGE_EXCHANGES.events,
    routingKey: EVENT_ROUTING_KEYS_V1['FileValidated.v1'],
    producer: 'validator-service',
    consumers: ['thumbnail-service', 'extractor-service', 'projection-service', 'audit-service'],
    status: 'implemented',
  },
  'FileRejected.v1': {
    kind: 'event',
    type: 'FileRejected.v1',
    exchange: MESSAGE_EXCHANGES.events,
    routingKey: EVENT_ROUTING_KEYS_V1['FileRejected.v1'],
    producer: 'validator-service',
    consumers: ['projection-service', 'notification-service', 'audit-service'],
    status: 'implemented',
  },
  'ThumbnailGenerated.v1': {
    kind: 'event',
    type: 'ThumbnailGenerated.v1',
    exchange: MESSAGE_EXCHANGES.events,
    routingKey: EVENT_ROUTING_KEYS_V1['ThumbnailGenerated.v1'],
    producer: 'thumbnail-service',
    consumers: ['projection-service', 'audit-service'],
    status: 'implemented',
  },
  'MetadataExtracted.v1': {
    kind: 'event',
    type: 'MetadataExtracted.v1',
    exchange: MESSAGE_EXCHANGES.events,
    routingKey: EVENT_ROUTING_KEYS_V1['MetadataExtracted.v1'],
    producer: 'extractor-service',
    consumers: ['projection-service', 'audit-service'],
    status: 'implemented',
  },
  'ProcessingCompleted.v1': {
    kind: 'event',
    type: 'ProcessingCompleted.v1',
    exchange: MESSAGE_EXCHANGES.events,
    routingKey: EVENT_ROUTING_KEYS_V1['ProcessingCompleted.v1'],
    producer: 'projection-service',
    consumers: ['projection-service', 'notification-service', 'audit-service'],
    status: 'implemented',
  },
  'DlqRedriveCompleted.v1': {
    kind: 'event',
    type: 'DlqRedriveCompleted.v1',
    exchange: MESSAGE_EXCHANGES.events,
    routingKey: EVENT_ROUTING_KEYS_V1['DlqRedriveCompleted.v1'],
    producer: 'api-gateway',
    consumers: ['audit-service', 'projection-service (ignored)'],
    status: 'implemented',
  },
};

export type DomainCommandV1<TType extends keyof CommandPayloadMapV1 = keyof CommandPayloadMapV1> =
  CommandEnvelope<CommandPayloadMapV1[TType], TType>;

export type DomainEventV1<TType extends keyof EventPayloadMapV1 = keyof EventPayloadMapV1> =
  EventEnvelope<EventPayloadMapV1[TType], TType>;

export type AnyDomainCommandV1 = {
  [K in keyof CommandPayloadMapV1]: DomainCommandV1<K>;
}[keyof CommandPayloadMapV1];

export type AnyDomainEventV1 = {
  [K in keyof EventPayloadMapV1]: DomainEventV1<K>;
}[keyof EventPayloadMapV1];
