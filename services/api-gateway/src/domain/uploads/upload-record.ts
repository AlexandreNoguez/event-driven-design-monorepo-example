export interface UploadTimelineItem {
  eventId: string;
  type: string;
  occurredAt: string;
  correlationId: string;
  payload: Record<string, unknown>;
}

export type UploadCommandType = 'UploadRequested.v1' | 'ReprocessFileRequested.v1';

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
  lastCommand: UploadCommandType;
  timeline: UploadTimelineItem[];
}
