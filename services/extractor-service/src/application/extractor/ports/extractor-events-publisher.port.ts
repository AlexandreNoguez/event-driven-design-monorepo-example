import type { DomainEventV1 } from '@event-pipeline/shared';

export const EXTRACTOR_EVENTS_PUBLISHER_PORT = Symbol('EXTRACTOR_EVENTS_PUBLISHER_PORT');

export interface ExtractorEventsPublisherPort {
  publishDomainEvent(event: DomainEventV1, routingKey: string): Promise<void>;
}
