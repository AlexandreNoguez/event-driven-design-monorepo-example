import type { CommandEnvelope, EventEnvelope } from './envelope.js';

export type CommandTypeV1 = 'UploadRequested.v1' | 'ReprocessFileRequested.v1';

export type EventTypeV1 =
  | 'FileUploaded.v1'
  | 'FileValidated.v1'
  | 'FileRejected.v1'
  | 'ThumbnailGenerated.v1'
  | 'MetadataExtracted.v1'
  | 'ProcessingCompleted.v1';

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
}

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
