export interface CreateUploadRequestBody {
  fileId?: string;
  fileName: string;
  contentType: string;
  sizeBytes: number;
}

export interface ReprocessUploadRequestBody {
  reason?: string;
}

export interface ConfirmUploadRequestBody {
  eTag?: string;
}
