import { Injectable } from '@nestjs/common';
import { Client } from 'minio';
import type {
  ReadObjectResult,
  ThumbnailObjectStoragePort,
  WriteObjectInput,
} from '../../application/thumbnail/ports/thumbnail-object-storage.port';

@Injectable()
export class MinioThumbnailObjectStorageAdapter implements ThumbnailObjectStoragePort {
  private readonly client = new Client({
    endPoint: process.env.MINIO_ENDPOINT ?? 'localhost',
    port: parsePort(process.env.MINIO_API_PORT, 9000),
    useSSL: (process.env.MINIO_USE_SSL ?? 'false').toLowerCase() === 'true',
    accessKey: process.env.MINIO_ROOT_USER ?? 'minioadmin',
    secretKey: process.env.MINIO_ROOT_PASSWORD ?? 'minioadmin',
    region: process.env.S3_REGION ?? 'us-east-1',
  });

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

function parsePort(raw: string | undefined, fallback: number): number {
  const value = raw ? Number.parseInt(raw, 10) : fallback;
  return Number.isFinite(value) && value > 0 ? value : fallback;
}
