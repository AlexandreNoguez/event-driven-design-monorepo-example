import type {
  DomainEventV1,
  MetadataExtractedPayload,
} from '@event-pipeline/shared';

export type FileValidatedEvent = DomainEventV1<'FileValidated.v1'>;

export interface ExtractorConfig {
  includeSha256: boolean;
  imageMetadataMimeTypes: string[];
}

export interface ImageMetadataInfo {
  width?: number;
  height?: number;
  format?: string;
  space?: string;
  hasAlpha?: boolean;
}

export function createMetadataExtractedPayload(input: {
  sourceEvent: FileValidatedEvent;
  metadata: Record<string, unknown>;
}): MetadataExtractedPayload {
  return {
    fileId: input.sourceEvent.payload.fileId,
    userId: input.sourceEvent.payload.userId,
    tenantId: input.sourceEvent.payload.tenantId,
    metadata: input.metadata,
  };
}

export function buildMetadataMap(input: {
  sourceEvent: FileValidatedEvent;
  eTag?: string;
  sha256Checksum?: string;
  imageMetadata?: ImageMetadataInfo;
}): Record<string, unknown> {
  const { sourceEvent } = input;

  const metadata: Record<string, unknown> = {
    contentType: sourceEvent.payload.contentType,
    sizeBytes: sourceEvent.payload.sizeBytes,
    bucket: sourceEvent.payload.bucket,
    objectKey: sourceEvent.payload.objectKey,
    validatorChecksum: sourceEvent.payload.checksum ?? null,
    extractedAt: new Date().toISOString(),
  };

  if (input.eTag) {
    metadata.storageEtag = input.eTag;
  }

  if (input.sha256Checksum) {
    metadata.checksumSha256 = input.sha256Checksum;
  }

  if (input.imageMetadata) {
    metadata.image = {
      width: input.imageMetadata.width,
      height: input.imageMetadata.height,
      format: input.imageMetadata.format,
      colorSpace: input.imageMetadata.space,
      hasAlpha: input.imageMetadata.hasAlpha,
    };
  }

  return metadata;
}

export function shouldAttemptImageMetadata(
  mimeType: string,
  configuredMimeTypes: string[],
): boolean {
  const normalized = normalizeMimeType(mimeType);
  return new Set(configuredMimeTypes.map(normalizeMimeType)).has(normalized);
}

export function parseImageMetadataMimeTypes(raw: string | undefined): string[] {
  const fallback = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'];
  if (!raw || raw.trim().length === 0) {
    return fallback;
  }

  const values = raw
    .split(',')
    .map((value) => normalizeMimeType(value))
    .filter((value) => value.length > 0);

  return values.length > 0 ? Array.from(new Set(values)) : fallback;
}

export function parseBoolean(raw: string | undefined, fallback: boolean): boolean {
  if (!raw) {
    return fallback;
  }

  const normalized = raw.trim().toLowerCase();
  if (['true', '1', 'yes', 'y'].includes(normalized)) {
    return true;
  }
  if (['false', '0', 'no', 'n'].includes(normalized)) {
    return false;
  }
  return fallback;
}

export function normalizeMimeType(value: string): string {
  const normalized = value.trim().toLowerCase();
  return normalized === 'image/jpg' ? 'image/jpeg' : normalized;
}
