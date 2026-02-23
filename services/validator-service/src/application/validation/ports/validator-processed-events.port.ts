export const VALIDATOR_PROCESSED_EVENTS_PORT = Symbol('VALIDATOR_PROCESSED_EVENTS_PORT');

export interface MarkProcessedEventInput {
  eventId: string;
  consumerName: string;
  correlationId?: string;
  messageType?: string;
  sourceProducer?: string;
}

export interface ValidatorProcessedEventsPort {
  hasProcessedEvent(eventId: string, consumerName: string): Promise<boolean>;
  markProcessedEvent(input: MarkProcessedEventInput): Promise<void>;
}
