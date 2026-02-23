import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import type { AuthenticatedUser } from '../../domain/auth/authenticated-user';
import type { ApiUploadRecord } from '../../domain/uploads/upload-record';
import type {
  ReprocessFileRequestedCommandPayload,
  UploadRequestedCommandPayload,
} from './contracts/upload-command.contracts';
import {
  COMMAND_PUBLISHER,
  type CommandEnvelopeLike,
  type CommandPublisher,
} from './ports/command-publisher.port';
import {
  UPLOAD_OBJECT_STORAGE,
  type UploadObjectStorage,
} from './ports/upload-object-storage.port';
import {
  UPLOADS_READ_MODEL_REPOSITORY,
  type UploadsReadModelRepository,
} from './ports/uploads-read-model.port';

interface RequestUploadInput {
  fileId?: string;
  fileName: string;
  contentType: string;
  sizeBytes: number;
  user: AuthenticatedUser;
  correlationId?: string;
}

interface ConfirmUploadInput {
  fileId: string;
  requester: AuthenticatedUser;
  correlationId?: string;
  eTag?: string;
}

interface ListUploadsInput {
  requester: AuthenticatedUser;
  userIdFilter?: string;
}

interface GetUploadStatusInput {
  fileId: string;
  requester: AuthenticatedUser;
}

interface RequestReprocessInput {
  fileId: string;
  reason?: string;
  requester: AuthenticatedUser;
  correlationId?: string;
}

@Injectable()
export class UploadsApplicationService {
  private readonly logger = new Logger(UploadsApplicationService.name);

  constructor(
    @Inject(UPLOADS_READ_MODEL_REPOSITORY)
    private readonly uploadsStore: UploadsReadModelRepository,
    @Inject(COMMAND_PUBLISHER)
    private readonly publisher: CommandPublisher,
    @Inject(UPLOAD_OBJECT_STORAGE)
    private readonly uploadObjectStorage: UploadObjectStorage,
  ) {}

  async requestUpload(input: RequestUploadInput) {
    const parsed = this.parseCreateUploadInput(input);
    const fileId = parsed.fileId ?? generateUuid();
    const correlationId = ensureCorrelationId(input.correlationId);

    const presigned = await this.uploadObjectStorage.createPresignedUploadUrl({
      fileId,
      fileName: parsed.fileName,
      contentType: parsed.contentType,
    });

    const record = this.uploadsStore.upsertInitiated({
      fileId,
      correlationId,
      userId: input.user.subject,
      userName: input.user.username,
      tenantId: input.user.tenantId,
      fileName: parsed.fileName,
      contentType: parsed.contentType,
      sizeBytes: parsed.sizeBytes,
    });

    this.logger.log(`Presigned upload URL issued for fileId=${fileId}`);

    return {
      fileId: record.fileId,
      correlationId: record.correlationId,
      status: record.status,
      initiatedAt: record.updatedAt,
      upload: {
        method: presigned.method,
        url: presigned.url,
        bucket: presigned.bucket,
        objectKey: presigned.objectKey,
        expiresAt: presigned.expiresAt,
        requiredHeaders: presigned.requiredHeaders,
      },
      next: {
        confirmEndpoint: `/uploads/${record.fileId}/confirm`,
      },
    };
  }

  async confirmUpload(input: ConfirmUploadInput) {
    const fileId = normalizeRequiredString(input.fileId, 'fileId');
    const record = this.assertUploadVisibleToRequester(fileId, input.requester);

    if (record.status === 'upload-requested') {
      return {
        fileId: record.fileId,
        correlationId: record.correlationId,
        status: record.status,
        alreadyConfirmed: true,
        acceptedAt: record.updatedAt,
      };
    }

    const correlationId = ensureCorrelationId(input.correlationId ?? record.correlationId);

    const objectRef = this.uploadObjectStorage.resolveUploadObjectRef({
      fileId: record.fileId,
      fileName: record.fileName,
    });

    let stat;
    try {
      stat = await this.uploadObjectStorage.statUploadedObject(objectRef);
    } catch {
      throw new BadRequestException(
        `Uploaded object not found in storage for file "${record.fileId}". Confirm after sending the PUT to MinIO.`,
      );
    }

    if (stat.sizeBytes !== record.sizeBytes) {
      throw new BadRequestException(
        `Uploaded object size mismatch for file "${record.fileId}". Expected ${record.sizeBytes} bytes, got ${stat.sizeBytes}.`,
      );
    }

    if (input.eTag && stat.eTag && normalizeEtag(input.eTag) !== normalizeEtag(stat.eTag)) {
      throw new BadRequestException(`ETag mismatch for file "${record.fileId}".`);
    }

    const payload: UploadRequestedCommandPayload = {
      fileId: record.fileId,
      fileName: record.fileName,
      contentType: record.contentType,
      sizeBytes: record.sizeBytes,
      userId: record.userId,
      tenantId: record.tenantId,
    };

    const envelope = this.createCommandEnvelope<UploadRequestedCommandPayload>({
      type: 'UploadRequested.v1',
      payload,
      correlationId,
    });

    await this.publisher.publishCommand(envelope, 'commands.upload.requested.v1');

    const nextRecord = this.uploadsStore.upsertRequested({
      fileId: record.fileId,
      correlationId,
      userId: record.userId,
      userName: record.userName,
      tenantId: record.tenantId,
      fileName: record.fileName,
      contentType: record.contentType,
      sizeBytes: record.sizeBytes,
    });

    this.logger.log(`UploadRequested.v1 published for fileId=${record.fileId} after storage confirmation`);

    return {
      fileId: nextRecord.fileId,
      correlationId: nextRecord.correlationId,
      status: nextRecord.status,
      commandType: envelope.type,
      routingKey: 'commands.upload.requested.v1',
      acceptedAt: nextRecord.updatedAt,
      storage: {
        bucket: stat.bucket,
        objectKey: stat.objectKey,
        eTag: stat.eTag,
        sizeBytes: stat.sizeBytes,
      },
    };
  }

  listUploads(input: ListUploadsInput) {
    const isAdmin = input.requester.roles.includes('admin');
    const items = this.uploadsStore.list({
      requesterUserId: input.requester.subject,
      isAdmin,
      userIdFilter: isAdmin ? input.userIdFilter : undefined,
    });

    return {
      items,
      total: items.length,
      scope: isAdmin ? 'admin' : 'mine',
    };
  }

  getUploadStatus(input: GetUploadStatusInput) {
    const record = this.assertUploadVisibleToRequester(input.fileId, input.requester);
    return this.toStatusResponse(record);
  }

  async requestReprocess(input: RequestReprocessInput) {
    const fileId = normalizeRequiredString(input.fileId, 'fileId');
    const reason = this.optionalString(input.reason);
    const correlationId = ensureCorrelationId(input.correlationId);

    const payload: ReprocessFileRequestedCommandPayload = {
      fileId,
      reason,
      userId: input.requester.subject,
      tenantId: input.requester.tenantId,
    };

    const envelope = this.createCommandEnvelope<ReprocessFileRequestedCommandPayload>({
      type: 'ReprocessFileRequested.v1',
      payload,
      correlationId,
    });

    await this.publisher.publishCommand(envelope, 'commands.file.reprocess.v1');

    const record = this.uploadsStore.markReprocessRequested({
      fileId,
      correlationId,
      requestedByUserId: input.requester.subject,
      requestedByUserName: input.requester.username,
      reason,
    });

    this.logger.log(`ReprocessFileRequested.v1 published for fileId=${fileId}`);

    return {
      fileId: record.fileId,
      correlationId: record.correlationId,
      status: record.status,
      reprocessCount: record.reprocessCount,
      commandType: envelope.type,
      routingKey: 'commands.file.reprocess.v1',
      acceptedAt: record.updatedAt,
      reason,
    };
  }

  private assertUploadVisibleToRequester(fileId: string, requester: AuthenticatedUser): ApiUploadRecord {
    const isAdmin = requester.roles.includes('admin');
    const record = this.uploadsStore.getById(fileId);

    if (!record) {
      throw new NotFoundException(`Upload "${fileId}" not found.`);
    }

    if (!isAdmin && record.userId !== requester.subject) {
      throw new NotFoundException(`Upload "${fileId}" not found.`);
    }

    return record;
  }

  private parseCreateUploadInput(input: RequestUploadInput) {
    const fileName = normalizeRequiredString(input.fileName, 'fileName');
    const contentType = normalizeRequiredString(input.contentType, 'contentType');
    const sizeBytes = normalizePositiveInteger(input.sizeBytes, 'sizeBytes');
    const fileId = this.optionalString(input.fileId);

    return {
      fileId,
      fileName,
      contentType,
      sizeBytes,
    };
  }

  private optionalString(value: unknown): string | undefined {
    if (typeof value !== 'string') {
      return undefined;
    }

    const normalized = value.trim();
    return normalized.length > 0 ? normalized : undefined;
  }

  private createCommandEnvelope<TPayload>(input: {
    type: string;
    payload: TPayload;
    correlationId: string;
  }): CommandEnvelopeLike {
    return {
      messageId: generateUuid(),
      kind: 'command',
      type: input.type,
      occurredAt: new Date().toISOString(),
      correlationId: input.correlationId,
      producer: 'api-gateway',
      version: 1,
      payload: input.payload,
    };
  }

  private toStatusResponse(record: ApiUploadRecord) {
    return {
      fileId: record.fileId,
      correlationId: record.correlationId,
      status: record.status,
      fileName: record.fileName,
      contentType: record.contentType,
      sizeBytes: record.sizeBytes,
      reprocessCount: record.reprocessCount,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
      owner: {
        userId: record.userId,
        username: record.userName,
        tenantId: record.tenantId,
      },
      lastCommand: record.lastCommand,
      timeline: record.timeline,
    };
  }
}

function ensureCorrelationId(value?: string): string {
  if (typeof value === 'string' && value.trim().length > 0) {
    return value.trim();
  }
  return generateUuid();
}

function generateUuid(): string {
  return globalThis.crypto?.randomUUID?.() ?? fallbackUuid();
}

function fallbackUuid(): string {
  const randomHex = (length: number): string => {
    let output = '';
    while (output.length < length) {
      output += Math.floor(Math.random() * 16).toString(16);
    }
    return output.slice(0, length);
  };

  return `${randomHex(8)}-${randomHex(4)}-4${randomHex(3)}-a${randomHex(3)}-${randomHex(12)}`;
}

function normalizeRequiredString(value: unknown, fieldName: string): string {
  if (typeof value !== 'string') {
    throw new BadRequestException(`Field "${fieldName}" must be a string.`);
  }

  const normalized = value.trim();
  if (!normalized) {
    throw new BadRequestException(`Field "${fieldName}" is required.`);
  }

  return normalized;
}

function normalizePositiveInteger(value: unknown, fieldName: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new BadRequestException(`Field "${fieldName}" must be a number.`);
  }

  if (!Number.isInteger(value) || value < 0) {
    throw new BadRequestException(`Field "${fieldName}" must be a non-negative integer.`);
  }

  return value;
}

function normalizeEtag(value: string): string {
  return value.trim().replace(/^"|"$/g, '');
}
