import type { DomainEventV1 } from '@event-pipeline/shared';

export const EXTRACTOR_OUTBOX_REPOSITORY_PORT = Symbol('EXTRACTOR_OUTBOX_REPOSITORY_PORT');

export interface StoreExtractorProcessedAndOutboxInput {
  eventId: string;
  consumerName: string;
  correlationId?: string;
  messageType?: string;
  sourceProducer?: string;
  outboxEvent: DomainEventV1<'MetadataExtracted.v1'>;
  routingKey: string;
}

export interface ExtractorOutboxPendingEvent {
  eventId: string;
  routingKey: string;
  attemptCount: number;
  envelope: DomainEventV1<'MetadataExtracted.v1'>;
}

export interface ExtractorOutboxRepositoryPort {
  storeProcessedEventAndOutbox(
    input: StoreExtractorProcessedAndOutboxInput,
  ): Promise<{ applied: boolean }>;
  findPendingOutboxEvents(limit: number): Promise<ExtractorOutboxPendingEvent[]>;
  markOutboxEventPublished(eventId: string): Promise<void>;
  markOutboxEventPublishFailed(
    eventId: string,
    errorMessage: string,
    terminalFailure: boolean,
  ): Promise<void>;
}

