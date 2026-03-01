import type { DomainEventV1 } from '@event-pipeline/shared';

export const PROJECTION_OUTBOX_REPOSITORY_PORT = Symbol('PROJECTION_OUTBOX_REPOSITORY_PORT');

export interface ProjectionOutboxPendingEvent {
  eventId: string;
  routingKey: string;
  attemptCount: number;
  envelope: DomainEventV1;
}

export interface ProjectionOutboxRepositoryPort {
  findPendingOutboxEvents(limit: number): Promise<ProjectionOutboxPendingEvent[]>;
  markOutboxEventPublished(eventId: string): Promise<void>;
  markOutboxEventPublishFailed(
    eventId: string,
    errorMessage: string,
    terminalFailure: boolean,
  ): Promise<void>;
}
