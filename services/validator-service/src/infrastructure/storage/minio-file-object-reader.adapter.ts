import { Injectable } from '@nestjs/common';
import { Client } from 'minio';
import type {
  FileObjectReaderPort,
  FileObjectStat,
} from '../../application/validation/ports/file-object-reader.port';
import { ValidatorServiceConfigService } from '../config/validator-service-config.service';

@Injectable()
export class MinioFileObjectReaderAdapter implements FileObjectReaderPort {
  private readonly client: Client;

  constructor(config: ValidatorServiceConfigService) {
    this.client = new Client({
      endPoint: config.minioEndpoint,
      port: config.minioApiPort,
      useSSL: config.minioUseSsl,
      accessKey: config.minioRootUser,
      secretKey: config.minioRootPassword,
      region: config.s3Region,
    });
  }

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

function normalizeEtag(etag?: string): string | undefined {
  if (!etag) {
    return undefined;
  }

  return etag.replace(/^"|"$/g, '');
}
