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
