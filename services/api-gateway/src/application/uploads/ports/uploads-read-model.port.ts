import type { ApiUploadRecord } from '../../../domain/uploads/upload-record';

export interface UpsertRequestedInput {
  fileId: string;
  correlationId: string;
  userId: string;
  userName: string;
  fileName: string;
  contentType: string;
  sizeBytes: number;
}

export interface MarkReprocessRequestedInput {
  fileId: string;
  correlationId: string;
  requestedByUserId: string;
  requestedByUserName: string;
  reason?: string;
}

export interface ListUploadsReadModelInput {
  requesterUserId: string;
  isAdmin: boolean;
  userIdFilter?: string;
}

export const UPLOADS_READ_MODEL_REPOSITORY = Symbol('UPLOADS_READ_MODEL_REPOSITORY');

export interface UploadsReadModelRepository {
  upsertRequested(input: UpsertRequestedInput): ApiUploadRecord;
  markReprocessRequested(input: MarkReprocessRequestedInput): ApiUploadRecord;
  getById(fileId: string): ApiUploadRecord | undefined;
  list(input: ListUploadsReadModelInput): ApiUploadRecord[];
}
