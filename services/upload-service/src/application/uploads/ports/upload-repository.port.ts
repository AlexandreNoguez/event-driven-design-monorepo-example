import type { OutboxPendingEvent, PersistUploadAndOutboxInput } from '../../../domain/uploads/upload-message.types';

export const UPLOAD_REPOSITORY_PORT = Symbol('UPLOAD_REPOSITORY_PORT');

export interface UploadRepositoryPort {
  persistUploadAndOutbox(input: PersistUploadAndOutboxInput): Promise<void>;
  findPendingOutboxEvents(limit: number): Promise<OutboxPendingEvent[]>;
  markOutboxEventPublished(eventId: string): Promise<void>;
  markOutboxEventPublishFailed(
    eventId: string,
    errorMessage: string,
    terminalFailure: boolean,
  ): Promise<void>;
}
