export type UploadLifecycleStatus =
  | 'initiated'
  | 'upload-requested'
  | 'uploaded'
  | 'processing'
  | 'completed'
  | 'rejected'
  | 'failed';

export interface UploadOwner {
  userId: string;
  username: string;
  tenantId?: string;
}

export interface UploadTimelineEntry {
  eventId: string;
  type: string;
  occurredAt: string;
  correlationId: string;
  payload: Record<string, unknown>;
}

export interface UploadRecordSummary {
  fileId: string;
  correlationId: string;
  status: UploadLifecycleStatus | string;
  fileName: string;
  contentType: string;
  sizeBytes: number;
  reprocessCount: number;
  createdAt: string;
  updatedAt: string;
  owner: UploadOwner;
  lastCommand: string;
  timeline: UploadTimelineEntry[];
}

export interface UploadListResponse {
  items: UploadRecordSummary[];
  total: number;
  scope: string;
}

export type UploadStatusResponse = UploadRecordSummary;

export interface CreateUploadRequest {
  fileName: string;
  contentType: string;
  sizeBytes: number;
}

export interface CreateUploadResponse {
  fileId: string;
  correlationId: string;
  status: string;
  initiatedAt: string;
  upload: {
    method: 'PUT';
    url: string;
    bucket: string;
    objectKey: string;
    expiresAt: string;
    requiredHeaders?: Record<string, string>;
  };
  next: {
    confirmEndpoint: string;
  };
}

export interface ConfirmUploadResponse {
  fileId: string;
  correlationId: string;
  status: string;
  acceptedAt: string;
  commandType?: string;
  routingKey?: string;
}
