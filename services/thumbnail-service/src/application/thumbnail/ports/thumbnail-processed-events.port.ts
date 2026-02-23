export const THUMBNAIL_PROCESSED_EVENTS_PORT = Symbol('THUMBNAIL_PROCESSED_EVENTS_PORT');

export interface MarkThumbnailProcessedEventInput {
  eventId: string;
  consumerName: string;
  correlationId?: string;
  messageType?: string;
  sourceProducer?: string;
}

export interface ThumbnailProcessedEventsPort {
  hasProcessedEvent(eventId: string, consumerName: string): Promise<boolean>;
  markProcessedEvent(input: MarkThumbnailProcessedEventInput): Promise<void>;
}
