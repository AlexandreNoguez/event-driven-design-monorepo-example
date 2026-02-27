import type { DomainEventV1 } from '@event-pipeline/shared';

export const VALIDATOR_OUTBOX_REPOSITORY_PORT = Symbol('VALIDATOR_OUTBOX_REPOSITORY_PORT');

export type ValidatorResultEvent =
  | DomainEventV1<'FileValidated.v1'>
  | DomainEventV1<'FileRejected.v1'>;

export interface StoreValidatorProcessedAndOutboxInput {
  eventId: string;
  consumerName: string;
  correlationId?: string;
  messageType?: string;
  sourceProducer?: string;
  outboxEvent: ValidatorResultEvent;
  routingKey: string;
}

export interface ValidatorOutboxPendingEvent {
  eventId: string;
  routingKey: string;
  attemptCount: number;
  envelope: ValidatorResultEvent;
}

export interface ValidatorOutboxRepositoryPort {
  storeProcessedEventAndOutbox(
    input: StoreValidatorProcessedAndOutboxInput,
  ): Promise<{ applied: boolean }>;
  findPendingOutboxEvents(limit: number): Promise<ValidatorOutboxPendingEvent[]>;
  markOutboxEventPublished(eventId: string): Promise<void>;
  markOutboxEventPublishFailed(
    eventId: string,
    errorMessage: string,
    terminalFailure: boolean,
  ): Promise<void>;
}

