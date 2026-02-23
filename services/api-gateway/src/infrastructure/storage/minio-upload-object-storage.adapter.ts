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
import { ApiGatewayConfigService } from '../config/api-gateway-config.service';

@Injectable()
export class MinioUploadObjectStorageAdapter implements UploadObjectStorage {
  private readonly client: Client;

  constructor(private readonly config: ApiGatewayConfigService) {
    this.client = new Client({
      endPoint: config.minioEndpoint,
      port: config.minioApiPort,
      useSSL: config.minioUseSsl,
      accessKey: config.minioRootUser,
      secretKey: config.minioRootPassword,
      region: config.s3Region,
    });
  }

  resolveUploadObjectRef(input: Pick<CreatePresignedUploadUrlInput, 'fileId' | 'fileName'>): UploadObjectRef {
    return {
      bucket: this.config.minioUploadsBucket,
      objectKey: buildObjectKey(input.fileId, input.fileName, this.config.uploadObjectKeyPrefix),
    };
  }

  async createPresignedUploadUrl(
    input: CreatePresignedUploadUrlInput,
  ): Promise<CreatePresignedUploadUrlResult> {
    const { bucket, objectKey } = this.resolveUploadObjectRef(input);
    const expiresSeconds = this.config.presignedExpiresSeconds;

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

function buildObjectKey(fileId: string, fileName: string, prefixValue: string): string {
  const prefix = prefixValue.trim() || 'raw';
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

function normalizeEtag(etag?: string): string | undefined {
  if (!etag) {
    return undefined;
  }

  return etag.replace(/^"|"$/g, '');
}
