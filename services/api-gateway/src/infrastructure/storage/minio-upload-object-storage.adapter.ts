import { Injectable } from '@nestjs/common';
import { Client } from 'minio';
import type {
  CreatePresignedUploadUrlInput,
  CreatePresignedUploadUrlResult,
  StatUploadedObjectInput,
  StatUploadedObjectResult,
  UploadObjectRef,
  UploadObjectStorage,
} from '../../application/uploads/ports/upload-object-storage.port';

@Injectable()
export class MinioUploadObjectStorageAdapter implements UploadObjectStorage {
  private readonly client = new Client({
    endPoint: process.env.MINIO_ENDPOINT ?? 'localhost',
    port: parsePort(process.env.MINIO_API_PORT, 9000),
    useSSL: (process.env.MINIO_USE_SSL ?? 'false').toLowerCase() === 'true',
    accessKey: process.env.MINIO_ROOT_USER ?? 'minioadmin',
    secretKey: process.env.MINIO_ROOT_PASSWORD ?? 'minioadmin',
    region: process.env.S3_REGION ?? 'us-east-1',
  });

  resolveUploadObjectRef(input: Pick<CreatePresignedUploadUrlInput, 'fileId' | 'fileName'>): UploadObjectRef {
    return {
      bucket: process.env.MINIO_BUCKET_UPLOADS ?? 'uploads',
      objectKey: buildObjectKey(input.fileId, input.fileName),
    };
  }

  async createPresignedUploadUrl(
    input: CreatePresignedUploadUrlInput,
  ): Promise<CreatePresignedUploadUrlResult> {
    const { bucket, objectKey } = this.resolveUploadObjectRef(input);
    const expiresSeconds = parsePositiveInt(process.env.API_GATEWAY_UPLOAD_PRESIGNED_EXPIRES_SECONDS, 900);

    const url = await this.client.presignedPutObject(bucket, objectKey, expiresSeconds);

    return {
      bucket,
      objectKey,
      url,
      expiresAt: new Date(Date.now() + expiresSeconds * 1000).toISOString(),
      method: 'PUT',
      requiredHeaders: {
        'content-type': input.contentType,
      },
    };
  }

  async statUploadedObject(input: StatUploadedObjectInput): Promise<StatUploadedObjectResult> {
    const stat = (await this.client.statObject(input.bucket, input.objectKey)) as {
      size?: number;
      etag?: string;
      metaData?: Record<string, string | undefined>;
    };

    return {
      bucket: input.bucket,
      objectKey: input.objectKey,
      sizeBytes: Number.isFinite(stat.size) ? Number(stat.size) : 0,
      eTag: normalizeEtag(stat.etag),
      contentType:
        stat.metaData?.['content-type'] ?? stat.metaData?.['Content-Type'] ?? stat.metaData?.['contentType'],
    };
  }
}

function buildObjectKey(fileId: string, fileName: string): string {
  const prefix = (process.env.UPLOAD_SERVICE_OBJECT_KEY_PREFIX ?? 'raw').trim() || 'raw';
  const safeName = sanitizeFileName(fileName);
  return `${prefix}/${fileId}/${safeName}`;
}

function sanitizeFileName(fileName: string): string {
  const normalized = fileName
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');

  return normalized || 'file.bin';
}

function parsePort(raw: string | undefined, fallback: number): number {
  const value = raw ? Number.parseInt(raw, 10) : fallback;
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function parsePositiveInt(raw: string | undefined, fallback: number): number {
  const value = raw ? Number.parseInt(raw, 10) : fallback;
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function normalizeEtag(etag?: string): string | undefined {
  if (!etag) {
    return undefined;
  }

  return etag.replace(/^"|"$/g, '');
}
