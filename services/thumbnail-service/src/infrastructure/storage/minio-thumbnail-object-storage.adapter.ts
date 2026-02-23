import { Injectable } from '@nestjs/common';
import { Client } from 'minio';
import type {
  ReadObjectResult,
  ThumbnailObjectStoragePort,
  WriteObjectInput,
} from '../../application/thumbnail/ports/thumbnail-object-storage.port';
import { ThumbnailServiceConfigService } from '../config/thumbnail-service-config.service';

@Injectable()
export class MinioThumbnailObjectStorageAdapter implements ThumbnailObjectStoragePort {
  private readonly client: Client;

  constructor(config: ThumbnailServiceConfigService) {
    this.client = new Client({
      endPoint: config.minioEndpoint,
      port: config.minioApiPort,
      useSSL: config.minioUseSsl,
      accessKey: config.minioRootUser,
      secretKey: config.minioRootPassword,
      region: config.s3Region,
    });
  }

  async readObject(bucket: string, objectKey: string): Promise<ReadObjectResult> {
    const stream = await this.client.getObject(bucket, objectKey);
    const chunks: Buffer[] = [];

    await new Promise<void>((resolve, reject) => {
      stream.on('data', (chunk: Buffer | string) => {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
      });
      stream.on('end', () => resolve());
      stream.on('error', (error: unknown) => reject(error));
    });

    return {
      buffer: Buffer.concat(chunks),
    };
  }

  async writeObject(input: WriteObjectInput): Promise<void> {
    await this.client.putObject(input.bucket, input.objectKey, input.body, input.body.length, {
      'Content-Type': input.contentType,
    });
  }
}
