import type { FileUploadedEventEnvelope } from '../../../domain/uploads/upload-message.types';

export const UPLOAD_EVENTS_PUBLISHER_PORT = Symbol('UPLOAD_EVENTS_PUBLISHER_PORT');

export interface UploadEventsPublisherPort {
  publishFileUploaded(envelope: FileUploadedEventEnvelope, routingKey?: string): Promise<void>;
}
