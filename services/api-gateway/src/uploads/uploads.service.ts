import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { RabbitMqPublisherService, type CommandEnvelopeLike } from '../messaging/rabbitmq-publisher.service';
import { UploadsStore } from './uploads.store';
import type {
  ApiUploadRecord,
  CreateUploadRequestBody,
  ReprocessUploadRequestBody,
  UploadRequestedCommandPayload,
  ReprocessFileRequestedCommandPayload,
} from './uploads.types';
import type { AuthenticatedUser } from '../auth/auth.types';

interface RequestUploadInput {
  body: CreateUploadRequestBody;
  user: AuthenticatedUser;
  correlationId?: string;
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
  body: ReprocessUploadRequestBody;
  requester: AuthenticatedUser;
  correlationId?: string;
}

@Injectable()
export class UploadsService {
  private readonly logger = new Logger(UploadsService.name);

  constructor(
    private readonly uploadsStore: UploadsStore,
    private readonly publisher: RabbitMqPublisherService,
  ) {}

  async requestUpload(input: RequestUploadInput) {
    const parsed = this.parseCreateUploadBody(input.body);
    const fileId = parsed.fileId ?? generateUuid();
    const correlationId = ensureCorrelationId(input.correlationId);

    const payload: UploadRequestedCommandPayload = {
      fileId,
      fileName: parsed.fileName,
      contentType: parsed.contentType,
      sizeBytes: parsed.sizeBytes,
      userId: input.user.subject,
      tenantId: input.user.tenantId,
    };

    const envelope = this.createCommandEnvelope<UploadRequestedCommandPayload>({
      type: 'UploadRequested.v1',
      payload,
      correlationId,
    });

    await this.publisher.publishCommand(envelope, 'commands.upload.requested.v1');

    const record = this.uploadsStore.upsertRequested({
      fileId,
      correlationId,
      userId: input.user.subject,
      userName: input.user.username,
      fileName: parsed.fileName,
      contentType: parsed.contentType,
      sizeBytes: parsed.sizeBytes,
    });

    this.logger.log(`UploadRequested.v1 published for fileId=${fileId}`);

    return {
      fileId: record.fileId,
      correlationId: record.correlationId,
      status: record.status,
      commandType: envelope.type,
      routingKey: 'commands.upload.requested.v1',
      acceptedAt: record.updatedAt,
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
    const isAdmin = input.requester.roles.includes('admin');
    const record = this.uploadsStore.getById(input.fileId);

    if (!record) {
      throw new NotFoundException(`Upload "${input.fileId}" not found.`);
    }

    if (!isAdmin && record.userId !== input.requester.subject) {
      throw new NotFoundException(`Upload "${input.fileId}" not found.`);
    }

    return this.toStatusResponse(record);
  }

  async requestReprocess(input: RequestReprocessInput) {
    const fileId = normalizeRequiredString(input.fileId, 'fileId');
    const reason = this.optionalString(input.body?.reason);
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

  private parseCreateUploadBody(body: CreateUploadRequestBody) {
    const fileName = normalizeRequiredString(body?.fileName, 'fileName');
    const contentType = normalizeRequiredString(body?.contentType, 'contentType');
    const sizeBytes = normalizePositiveInteger(body?.sizeBytes, 'sizeBytes');
    const fileId = this.optionalString(body?.fileId);

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
