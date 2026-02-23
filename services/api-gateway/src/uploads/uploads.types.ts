export interface CreateUploadRequestBody {
  fileId?: string;
  fileName: string;
  contentType: string;
  sizeBytes: number;
}

export interface ReprocessUploadRequestBody {
  reason?: string;
}

export interface UploadRequestedCommandPayload {
  fileId: string;
  fileName: string;
  contentType: string;
  sizeBytes: number;
  userId?: string;
  tenantId?: string;
}

export interface ReprocessFileRequestedCommandPayload {
  fileId: string;
  reason?: string;
  userId?: string;
  tenantId?: string;
}

export interface UploadTimelineItem {
  eventId: string;
  type: string;
  occurredAt: string;
  correlationId: string;
  payload: Record<string, unknown>;
}

export interface ApiUploadRecord {
  fileId: string;
  correlationId: string;
  userId: string;
  userName: string;
  fileName: string;
  contentType: string;
  sizeBytes: number;
  status: string;
  createdAt: string;
  updatedAt: string;
  reprocessCount: number;
  lastCommand: 'UploadRequested.v1' | 'ReprocessFileRequested.v1';
  timeline: UploadTimelineItem[];
}
