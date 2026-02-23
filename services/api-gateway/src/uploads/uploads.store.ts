import { Injectable } from '@nestjs/common';
import type { ApiUploadRecord, UploadTimelineItem } from './uploads.types';

interface UpsertRequestedInput {
  fileId: string;
  correlationId: string;
  userId: string;
  userName: string;
  fileName: string;
  contentType: string;
  sizeBytes: number;
}

interface MarkReprocessRequestedInput {
  fileId: string;
  correlationId: string;
  requestedByUserId: string;
  requestedByUserName: string;
  reason?: string;
}

interface ListInput {
  requesterUserId: string;
  isAdmin: boolean;
  userIdFilter?: string;
}

@Injectable()
export class UploadsStore {
  private readonly uploads = new Map<string, ApiUploadRecord>();

  upsertRequested(input: UpsertRequestedInput): ApiUploadRecord {
    const now = new Date().toISOString();
    const existing = this.uploads.get(input.fileId);

    const timeline = existing?.timeline ?? [];
    timeline.push(
      this.timelineItem('UploadRequested.v1', input.correlationId, {
        fileName: input.fileName,
        contentType: input.contentType,
        sizeBytes: input.sizeBytes,
      }),
    );

    const next: ApiUploadRecord = {
      fileId: input.fileId,
      correlationId: input.correlationId,
      userId: input.userId,
      userName: input.userName,
      fileName: input.fileName,
      contentType: input.contentType,
      sizeBytes: input.sizeBytes,
      status: 'upload-requested',
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
      reprocessCount: existing?.reprocessCount ?? 0,
      lastCommand: 'UploadRequested.v1',
      timeline,
    };

    this.uploads.set(input.fileId, next);
    return next;
  }

  markReprocessRequested(input: MarkReprocessRequestedInput): ApiUploadRecord {
    const now = new Date().toISOString();
    const existing = this.uploads.get(input.fileId);

    const timeline = [...(existing?.timeline ?? [])];
    timeline.push(
      this.timelineItem('ReprocessFileRequested.v1', input.correlationId, {
        requestedByUserId: input.requestedByUserId,
        requestedByUserName: input.requestedByUserName,
        reason: input.reason,
      }),
    );

    const next: ApiUploadRecord = {
      fileId: input.fileId,
      correlationId: input.correlationId,
      userId: existing?.userId ?? input.requestedByUserId,
      userName: existing?.userName ?? input.requestedByUserName,
      fileName: existing?.fileName ?? '(unknown)',
      contentType: existing?.contentType ?? 'application/octet-stream',
      sizeBytes: existing?.sizeBytes ?? 0,
      status: 'reprocess-requested',
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
      reprocessCount: (existing?.reprocessCount ?? 0) + 1,
      lastCommand: 'ReprocessFileRequested.v1',
      timeline,
    };

    this.uploads.set(input.fileId, next);
    return next;
  }

  getById(fileId: string): ApiUploadRecord | undefined {
    return this.uploads.get(fileId);
  }

  list(input: ListInput): ApiUploadRecord[] {
    let items = Array.from(this.uploads.values());

    if (!input.isAdmin) {
      items = items.filter((item) => item.userId === input.requesterUserId);
    }

    if (input.isAdmin && input.userIdFilter) {
      items = items.filter((item) => item.userId === input.userIdFilter);
    }

    return items.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  private timelineItem(
    type: string,
    correlationId: string,
    payload: Record<string, unknown>,
  ): UploadTimelineItem {
    return {
      eventId: generateLocalId(),
      type,
      occurredAt: new Date().toISOString(),
      correlationId,
      payload,
    };
  }
}

function generateLocalId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}
