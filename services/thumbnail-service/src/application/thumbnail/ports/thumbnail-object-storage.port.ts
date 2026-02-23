export const THUMBNAIL_OBJECT_STORAGE_PORT = Symbol('THUMBNAIL_OBJECT_STORAGE_PORT');

export interface ReadObjectResult {
  buffer: Buffer;
  contentType?: string;
}

export interface WriteObjectInput {
  bucket: string;
  objectKey: string;
  body: Buffer;
  contentType: string;
}

export interface ThumbnailObjectStoragePort {
  readObject(bucket: string, objectKey: string): Promise<ReadObjectResult>;
  writeObject(input: WriteObjectInput): Promise<void>;
}
