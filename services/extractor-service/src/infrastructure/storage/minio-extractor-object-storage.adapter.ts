import { Injectable } from '@nestjs/common';
import { Client } from 'minio';
import type {
  ExtractorObjectStat,
  ExtractorObjectStoragePort,
} from '../../application/extractor/ports/extractor-object-storage.port';
import { ExtractorServiceConfigService } from '../config/extractor-service-config.service';

@Injectable()
export class MinioExtractorObjectStorageAdapter implements ExtractorObjectStoragePort {
  private readonly client: Client;

  constructor(config: ExtractorServiceConfigService) {
    this.client = new Client({
      endPoint: config.minioEndpoint,
      port: config.minioApiPort,
      useSSL: config.minioUseSsl,
      accessKey: config.minioRootUser,
      secretKey: config.minioRootPassword,
      region: config.s3Region,
    });
  }

  async readObject(bucket: string, objectKey: string): Promise<Buffer> {
    const stream = await this.client.getObject(bucket, objectKey);
    const chunks: Buffer[] = [];

    await new Promise<void>((resolve, reject) => {
      stream.on('data', (chunk: Buffer | string) => {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
      });
      stream.on('end', () => resolve());
      stream.on('error', (error: unknown) => reject(error));
    });

    return Buffer.concat(chunks);
  }

  async statObject(bucket: string, objectKey: string): Promise<ExtractorObjectStat> {
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
}

function normalizeEtag(etag?: string): string | undefined {
  if (!etag) {
    return undefined;
  }
  return etag.replace(/^"|"$/g, '');
}
