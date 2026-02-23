import { Injectable } from '@nestjs/common';
import { Client } from 'minio';
import type {
  FileObjectReaderPort,
  FileObjectStat,
} from '../../application/validation/ports/file-object-reader.port';

@Injectable()
export class MinioFileObjectReaderAdapter implements FileObjectReaderPort {
  private readonly client = new Client({
    endPoint: process.env.MINIO_ENDPOINT ?? 'localhost',
    port: parsePort(process.env.MINIO_API_PORT, 9000),
    useSSL: (process.env.MINIO_USE_SSL ?? 'false').toLowerCase() === 'true',
    accessKey: process.env.MINIO_ROOT_USER ?? 'minioadmin',
    secretKey: process.env.MINIO_ROOT_PASSWORD ?? 'minioadmin',
    region: process.env.S3_REGION ?? 'us-east-1',
  });

  async statObject(bucket: string, objectKey: string): Promise<FileObjectStat> {
    const stat = (await this.client.statObject(bucket, objectKey)) as {
      size?: number;
      etag?: string;
      metaData?: Record<string, string | undefined>;
    };

    return {
      sizeBytes: Number.isFinite(stat.size) ? Number(stat.size) : 0,
      eTag: normalizeEtag(stat.etag),
      contentType:
        stat.metaData?.['content-type'] ?? stat.metaData?.['Content-Type'] ?? stat.metaData?.['contentType'],
    };
  }

  async readObjectHeader(bucket: string, objectKey: string, maxBytes: number): Promise<Uint8Array> {
    const stream = await this.client.getPartialObject(bucket, objectKey, 0, maxBytes);
    const chunks: Buffer[] = [];

    await new Promise<void>((resolve, reject) => {
      stream.on('data', (chunk: Buffer | string) => {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
      });
      stream.on('end', () => resolve());
      stream.on('error', (error: unknown) => reject(error));
    });

    return new Uint8Array(Buffer.concat(chunks));
  }
}

function parsePort(raw: string | undefined, fallback: number): number {
  const value = raw ? Number.parseInt(raw, 10) : fallback;
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function normalizeEtag(etag?: string): string | undefined {
  if (!etag) {
    return undefined;
  }

  return etag.replace(/^"|"$/g, '');
}
