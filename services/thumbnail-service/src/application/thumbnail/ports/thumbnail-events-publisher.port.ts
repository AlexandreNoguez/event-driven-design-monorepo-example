import type { DomainEventV1 } from '@event-pipeline/shared';

export const THUMBNAIL_EVENTS_PUBLISHER_PORT = Symbol('THUMBNAIL_EVENTS_PUBLISHER_PORT');

export interface ThumbnailEventsPublisherPort {
  publishDomainEvent(event: DomainEventV1, routingKey: string): Promise<void>;
}
