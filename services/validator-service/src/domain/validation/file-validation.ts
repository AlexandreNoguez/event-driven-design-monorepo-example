import type {
  DomainEventV1,
  FileRejectedPayload,
  FileUploadedPayload,
  FileValidatedPayload,
} from '@event-pipeline/shared';

export type FileUploadedEvent = DomainEventV1<'FileUploaded.v1'>;

export interface FileObjectProbe {
  sizeBytes: number;
  eTag?: string;
  headerBytes: Uint8Array;
}

export interface ValidatorPolicyConfig {
  maxSizeBytes: number;
  allowedMimeTypes: string[];
}

export type ValidationDecision =
  | {
      outcome: 'validated';
      payload: FileValidatedPayload;
    }
  | {
      outcome: 'rejected';
      payload: FileRejectedPayload;
    };

export function validateUploadedFile(
  event: FileUploadedEvent,
  probe: FileObjectProbe,
  policy: ValidatorPolicyConfig,
): ValidationDecision {
  const declaredMime = normalizeMimeType(event.payload.contentType);
  const allowedMimes = new Set(policy.allowedMimeTypes.map(normalizeMimeType));

  if (event.payload.sizeBytes > policy.maxSizeBytes) {
    return rejected(event.payload, 'FILE_TOO_LARGE', `File exceeds max allowed size (${policy.maxSizeBytes} bytes).`);
  }

  if (probe.sizeBytes !== event.payload.sizeBytes) {
    return rejected(
      event.payload,
      'SIZE_MISMATCH',
      `Stored object size ${probe.sizeBytes} differs from declared size ${event.payload.sizeBytes}.`,
    );
  }

  if (!allowedMimes.has(declaredMime)) {
    return rejected(event.payload, 'UNSUPPORTED_MIME_TYPE', `MIME type "${event.payload.contentType}" is not allowed.`);
  }

  const detected = detectSignatureMimeType(probe.headerBytes);
  if (!detected) {
    return rejected(event.payload, 'INVALID_SIGNATURE', 'Unable to identify file signature.');
  }

  if (!isSignatureCompatible(declaredMime, detected)) {
    return rejected(
      event.payload,
      'SIGNATURE_MISMATCH',
      `Declared MIME "${event.payload.contentType}" does not match detected signature "${detected}".`,
    );
  }

  const checksum = probe.eTag ? `md5:${probe.eTag}` : undefined;

  const payload: FileValidatedPayload = {
    fileId: event.payload.fileId,
    userId: event.payload.userId,
    tenantId: event.payload.tenantId,
    bucket: event.payload.bucket,
    objectKey: event.payload.objectKey,
    contentType: event.payload.contentType,
    sizeBytes: event.payload.sizeBytes,
    checksum,
  };

  return {
    outcome: 'validated',
    payload,
  };
}

function rejected(source: FileUploadedPayload, code: string, reason: string): ValidationDecision {
  return {
    outcome: 'rejected',
    payload: {
      fileId: source.fileId,
      userId: source.userId,
      tenantId: source.tenantId,
      bucket: source.bucket,
      objectKey: source.objectKey,
      code,
      reason,
    },
  };
}

export function normalizeMimeType(value: string): string {
  const normalized = value.trim().toLowerCase();
  if (normalized === 'image/jpg') {
    return 'image/jpeg';
  }
  return normalized;
}

export function parseAllowedMimeTypes(raw: string | undefined): string[] {
  const fallback = ['image/png', 'image/jpeg', 'image/webp', 'application/pdf'];
  if (!raw || raw.trim().length === 0) {
    return fallback;
  }

  const values = raw
    .split(',')
    .map((value) => normalizeMimeType(value))
    .filter((value) => value.length > 0);

  return values.length > 0 ? Array.from(new Set(values)) : fallback;
}

export function parseMaxSizeBytes(raw: string | undefined, fallback = 20 * 1024 * 1024): number {
  const parsed = raw ? Number.parseInt(raw, 10) : fallback;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export function detectSignatureMimeType(bytes: Uint8Array): string | undefined {
  if (bytes.length >= 8 && startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) {
    return 'image/png';
  }

  if (bytes.length >= 3 && startsWith(bytes, [0xff, 0xd8, 0xff])) {
    return 'image/jpeg';
  }

  if (bytes.length >= 6) {
    const ascii6 = ascii(bytes.slice(0, 6));
    if (ascii6 === 'GIF87a' || ascii6 === 'GIF89a') {
      return 'image/gif';
    }
  }

  if (bytes.length >= 12) {
    const riff = ascii(bytes.slice(0, 4));
    const webp = ascii(bytes.slice(8, 12));
    if (riff === 'RIFF' && webp === 'WEBP') {
      return 'image/webp';
    }
  }

  if (bytes.length >= 5 && ascii(bytes.slice(0, 5)) === '%PDF-') {
    return 'application/pdf';
  }

  return undefined;
}

function isSignatureCompatible(declaredMime: string, detectedMime: string): boolean {
  return normalizeMimeType(declaredMime) === normalizeMimeType(detectedMime);
}

function startsWith(bytes: Uint8Array, prefix: number[]): boolean {
  if (bytes.length < prefix.length) {
    return false;
  }

  for (let index = 0; index < prefix.length; index += 1) {
    if (bytes[index] !== prefix[index]) {
      return false;
    }
  }

  return true;
}

function ascii(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((value) => String.fromCharCode(value))
    .join('');
}
