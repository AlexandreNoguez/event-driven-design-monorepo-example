import type { DomainEventV1 } from '@event-pipeline/shared';

export const PROJECTION_EVENTS_PUBLISHER_PORT = Symbol('PROJECTION_EVENTS_PUBLISHER_PORT');

export interface ProjectionEventsPublisherPort {
  publishDomainEvent(event: DomainEventV1, routingKey: string): Promise<void>;
}
