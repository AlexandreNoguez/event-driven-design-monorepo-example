import type { DomainEventV1 } from '@event-pipeline/shared';

export const THUMBNAIL_OUTBOX_REPOSITORY_PORT = Symbol('THUMBNAIL_OUTBOX_REPOSITORY_PORT');

export interface StoreThumbnailProcessedAndOutboxInput {
  eventId: string;
  consumerName: string;
  correlationId?: string;
  messageType?: string;
  sourceProducer?: string;
  outboxEvent: DomainEventV1<'ThumbnailGenerated.v1'>;
  routingKey: string;
}

export interface ThumbnailOutboxPendingEvent {
  eventId: string;
  routingKey: string;
  attemptCount: number;
  envelope: DomainEventV1<'ThumbnailGenerated.v1'>;
}

export interface ThumbnailOutboxRepositoryPort {
  storeProcessedEventAndOutbox(
    input: StoreThumbnailProcessedAndOutboxInput,
  ): Promise<{ applied: boolean }>;
  findPendingOutboxEvents(limit: number): Promise<ThumbnailOutboxPendingEvent[]>;
  markOutboxEventPublished(eventId: string): Promise<void>;
  markOutboxEventPublishFailed(
    eventId: string,
    errorMessage: string,
    terminalFailure: boolean,
  ): Promise<void>;
}

