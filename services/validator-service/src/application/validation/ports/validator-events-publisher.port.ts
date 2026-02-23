import type { DomainEventV1 } from '@event-pipeline/shared';

export const VALIDATOR_EVENTS_PUBLISHER_PORT = Symbol('VALIDATOR_EVENTS_PUBLISHER_PORT');

export interface ValidatorEventsPublisherPort {
  publishDomainEvent(event: DomainEventV1, routingKey: string): Promise<void>;
}
