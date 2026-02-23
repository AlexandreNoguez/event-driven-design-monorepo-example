export interface CreatePresignedUploadUrlInput {
  fileId: string;
  fileName: string;
  contentType: string;
}

export interface UploadObjectRef {
  bucket: string;
  objectKey: string;
}

export interface CreatePresignedUploadUrlResult {
  bucket: string;
  objectKey: string;
  url: string;
  expiresAt: string;
  method: 'PUT';
  requiredHeaders: Record<string, string>;
}

export interface StatUploadedObjectInput {
  bucket: string;
  objectKey: string;
}

export interface StatUploadedObjectResult {
  bucket: string;
  objectKey: string;
  sizeBytes: number;
  eTag?: string;
  contentType?: string;
}

export const UPLOAD_OBJECT_STORAGE = Symbol('UPLOAD_OBJECT_STORAGE');

export interface UploadObjectStorage {
  resolveUploadObjectRef(input: Pick<CreatePresignedUploadUrlInput, 'fileId' | 'fileName'>): UploadObjectRef;
  createPresignedUploadUrl(input: CreatePresignedUploadUrlInput): Promise<CreatePresignedUploadUrlResult>;
  statUploadedObject(input: StatUploadedObjectInput): Promise<StatUploadedObjectResult>;
}
