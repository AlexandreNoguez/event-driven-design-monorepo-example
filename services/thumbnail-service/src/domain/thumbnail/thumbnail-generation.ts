import type {
  DomainEventV1,
  ThumbnailGeneratedPayload,
} from '@event-pipeline/shared';

export type FileValidatedEvent = DomainEventV1<'FileValidated.v1'>;

export interface ThumbnailRenderResult {
  buffer: Buffer;
  contentType: string;
  extension: string;
  width?: number;
  height?: number;
}

export interface ThumbnailConfig {
  width: number;
  height: number;
  outputFormat: 'webp';
  webpQuality: number;
  objectKeyPrefix: string;
  supportedMimeTypes: string[];
}

export function isThumbnailSupportedMime(mimeType: string, supportedMimeTypes: string[]): boolean {
  return new Set(supportedMimeTypes.map(normalizeMimeType)).has(normalizeMimeType(mimeType));
}

export function buildThumbnailObjectKey(
  fileId: string,
  extension: string,
  objectKeyPrefix = 'thumbnails',
): string {
  const prefix = objectKeyPrefix.trim() || 'thumbnails';
  const safeExtension = extension.trim().replace(/[^a-z0-9]/gi, '').toLowerCase() || 'webp';
  return `${prefix}/${fileId}/thumb.${safeExtension}`;
}

export function createThumbnailGeneratedPayload(input: {
  sourceEvent: FileValidatedEvent;
  thumbnailBucket: string;
  thumbnailObjectKey: string;
  width?: number;
  height?: number;
}): ThumbnailGeneratedPayload {
  return {
    fileId: input.sourceEvent.payload.fileId,
    userId: input.sourceEvent.payload.userId,
    tenantId: input.sourceEvent.payload.tenantId,
    thumbnailBucket: input.thumbnailBucket,
    thumbnailObjectKey: input.thumbnailObjectKey,
    width: input.width,
    height: input.height,
  };
}

export function parseSupportedMimeTypes(raw: string | undefined): string[] {
  const fallback = ['image/png', 'image/jpeg', 'image/webp'];
  if (!raw || raw.trim().length === 0) {
    return fallback;
  }

  const values = raw
    .split(',')
    .map((value) => normalizeMimeType(value))
    .filter((value) => value.length > 0);

  return values.length > 0 ? Array.from(new Set(values)) : fallback;
}

export function parsePositiveInt(raw: string | undefined, fallback: number): number {
  const parsed = raw ? Number.parseInt(raw, 10) : fallback;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export function parseWebpQuality(raw: string | undefined, fallback = 82): number {
  const parsed = raw ? Number.parseInt(raw, 10) : fallback;
  if (!Number.isFinite(parsed)) {
    return fallback;
  }

  return Math.max(1, Math.min(100, parsed));
}

export function normalizeMimeType(value: string): string {
  const normalized = value.trim().toLowerCase();
  return normalized === 'image/jpg' ? 'image/jpeg' : normalized;
}
