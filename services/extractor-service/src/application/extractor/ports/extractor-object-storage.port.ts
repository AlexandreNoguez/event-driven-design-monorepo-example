export const EXTRACTOR_OBJECT_STORAGE_PORT = Symbol('EXTRACTOR_OBJECT_STORAGE_PORT');

export interface ExtractorObjectStat {
  sizeBytes: number;
  eTag?: string;
  contentType?: string;
}

export interface ExtractorObjectStoragePort {
  readObject(bucket: string, objectKey: string): Promise<Buffer>;
  statObject(bucket: string, objectKey: string): Promise<ExtractorObjectStat>;
}
