export const FILE_OBJECT_READER_PORT = Symbol('FILE_OBJECT_READER_PORT');

export interface FileObjectStat {
  sizeBytes: number;
  eTag?: string;
  contentType?: string;
}

export interface FileObjectReaderPort {
  statObject(bucket: string, objectKey: string): Promise<FileObjectStat>;
  readObjectHeader(bucket: string, objectKey: string, maxBytes: number): Promise<Uint8Array>;
}
