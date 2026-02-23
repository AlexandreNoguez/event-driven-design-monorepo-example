export const EXTRACTOR_PROCESSED_EVENTS_PORT = Symbol('EXTRACTOR_PROCESSED_EVENTS_PORT');

export interface MarkExtractorProcessedEventInput {
  eventId: string;
  consumerName: string;
  correlationId?: string;
  messageType?: string;
  sourceProducer?: string;
}

export interface ExtractorProcessedEventsPort {
  hasProcessedEvent(eventId: string, consumerName: string): Promise<boolean>;
  markProcessedEvent(input: MarkExtractorProcessedEventInput): Promise<void>;
}
