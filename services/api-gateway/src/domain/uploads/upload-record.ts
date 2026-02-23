export interface UploadTimelineItem {
  eventId: string;
  type: string;
  occurredAt: string;
  correlationId: string;
  payload: Record<string, unknown>;
}

export type UploadActionType =
  | 'UploadSessionInitiated.local'
  | 'UploadRequested.v1'
  | 'ReprocessFileRequested.v1';

export interface ApiUploadRecord {
  fileId: string;
  correlationId: string;
  userId: string;
  userName: string;
  tenantId?: string;
  fileName: string;
  contentType: string;
  sizeBytes: number;
  status: string;
  createdAt: string;
  updatedAt: string;
  reprocessCount: number;
  lastCommand: UploadActionType;
  timeline: UploadTimelineItem[];
}
