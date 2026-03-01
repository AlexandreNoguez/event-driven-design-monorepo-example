import test from 'node:test';
import assert from 'node:assert/strict';
import {
  applyProcessingSagaEvent,
  deriveTerminalEventSpec,
  markProcessingSagaTimedOut,
} from '../../../services/projection-service/src/domain/process-manager/processing-saga';
import type { DomainEventV1 } from '../../../packages/shared/src/messaging/contracts';

function createFileUploadedEvent(): DomainEventV1<'FileUploaded.v1'> {
  return {
    messageId: 'evt-uploaded-1',
    kind: 'event',
    type: 'FileUploaded.v1',
    occurredAt: '2026-03-01T10:00:00.000Z',
    correlationId: 'corr-1',
    producer: 'upload-service',
    version: 1,
    payload: {
      fileId: 'file-1',
      fileName: 'sample.png',
      contentType: 'image/png',
      sizeBytes: 68,
      bucket: 'uploads',
      objectKey: 'raw/file-1/sample.png',
      userId: 'user-1',
      tenantId: 'tenant-1',
    },
  };
}

test('processing saga reaches completed and matches the current projection completion event', () => {
  const uploaded = createFileUploadedEvent();

  const validated: DomainEventV1<'FileValidated.v1'> = {
    messageId: 'evt-validated-1',
    kind: 'event',
    type: 'FileValidated.v1',
    occurredAt: '2026-03-01T10:00:01.000Z',
    correlationId: uploaded.correlationId,
    causationId: uploaded.messageId,
    producer: 'validator-service',
    version: 1,
    payload: {
      fileId: uploaded.payload.fileId,
      bucket: uploaded.payload.bucket,
      objectKey: uploaded.payload.objectKey,
      contentType: uploaded.payload.contentType,
      sizeBytes: uploaded.payload.sizeBytes,
      userId: uploaded.payload.userId,
      tenantId: uploaded.payload.tenantId,
      checksum: 'md5:etag-1',
    },
  };

  const thumbnail: DomainEventV1<'ThumbnailGenerated.v1'> = {
    messageId: 'evt-thumbnail-1',
    kind: 'event',
    type: 'ThumbnailGenerated.v1',
    occurredAt: '2026-03-01T10:00:02.000Z',
    correlationId: uploaded.correlationId,
    causationId: validated.messageId,
    producer: 'thumbnail-service',
    version: 1,
    payload: {
      fileId: uploaded.payload.fileId,
      thumbnailBucket: 'thumbnails',
      thumbnailObjectKey: 'thumbnails/file-1/thumb.webp',
      width: 320,
      height: 320,
      userId: uploaded.payload.userId,
      tenantId: uploaded.payload.tenantId,
    },
  };

  const metadata: DomainEventV1<'MetadataExtracted.v1'> = {
    messageId: 'evt-metadata-1',
    kind: 'event',
    type: 'MetadataExtracted.v1',
    occurredAt: '2026-03-01T10:00:03.000Z',
    correlationId: uploaded.correlationId,
    causationId: validated.messageId,
    producer: 'extractor-service',
    version: 1,
    payload: {
      fileId: uploaded.payload.fileId,
      metadata: {
        width: 1,
        height: 1,
      },
      userId: uploaded.payload.userId,
      tenantId: uploaded.payload.tenantId,
    },
  };

  const processingCompleted: DomainEventV1<'ProcessingCompleted.v1'> = {
    messageId: 'evt-completed-1',
    kind: 'event',
    type: 'ProcessingCompleted.v1',
    occurredAt: '2026-03-01T10:00:04.000Z',
    correlationId: uploaded.correlationId,
    causationId: metadata.messageId,
    producer: 'projection-service',
    version: 1,
    payload: {
      fileId: uploaded.payload.fileId,
      status: 'completed',
      completedSteps: ['upload', 'validation', 'thumbnail', 'metadata'],
      userId: uploaded.payload.userId,
      tenantId: uploaded.payload.tenantId,
    },
  };

  let sagaState = applyProcessingSagaEvent({
    event: uploaded,
    timeoutMs: 300000,
  });
  sagaState = applyProcessingSagaEvent({
    current: sagaState,
    event: validated,
    timeoutMs: 300000,
  });
  sagaState = applyProcessingSagaEvent({
    current: sagaState,
    event: thumbnail,
    timeoutMs: 300000,
  });
  sagaState = applyProcessingSagaEvent({
    current: sagaState,
    event: metadata,
    timeoutMs: 300000,
  });

  assert.equal(sagaState.status, 'completed');
  assert.equal(sagaState.comparisonStatus, 'pending');
  assert.deepEqual(deriveTerminalEventSpec(sagaState), {
    type: 'ProcessingCompleted.v1',
    status: 'completed',
    completedSteps: ['upload', 'validation', 'thumbnail', 'metadata'],
  });

  sagaState = applyProcessingSagaEvent({
    current: sagaState,
    event: processingCompleted,
    timeoutMs: 300000,
  });

  assert.equal(sagaState.status, 'completed');
  assert.equal(sagaState.projectionCompletionStatus, 'completed');
  assert.equal(sagaState.comparisonStatus, 'match');
});

test('processing saga emits a failed terminal spec when validation rejects the file', () => {
  const uploaded = createFileUploadedEvent();

  const rejected: DomainEventV1<'FileRejected.v1'> = {
    messageId: 'evt-rejected-1',
    kind: 'event',
    type: 'FileRejected.v1',
    occurredAt: '2026-03-01T10:00:02.000Z',
    correlationId: uploaded.correlationId,
    causationId: uploaded.messageId,
    producer: 'validator-service',
    version: 1,
    payload: {
      fileId: uploaded.payload.fileId,
      bucket: uploaded.payload.bucket,
      objectKey: uploaded.payload.objectKey,
      code: 'UNSUPPORTED_SIGNATURE',
      reason: 'The uploaded bytes do not match a PNG signature.',
      userId: uploaded.payload.userId,
      tenantId: uploaded.payload.tenantId,
    },
  };

  let sagaState = applyProcessingSagaEvent({
    event: uploaded,
    timeoutMs: 300000,
  });
  sagaState = applyProcessingSagaEvent({
    current: sagaState,
    event: rejected,
    timeoutMs: 300000,
  });

  assert.equal(sagaState.status, 'failed');
  assert.equal(sagaState.comparisonStatus, 'pending');
  assert.deepEqual(deriveTerminalEventSpec(sagaState), {
    type: 'ProcessingFailed.v1',
    status: 'failed',
    completedSteps: ['upload'],
    failedStage: 'validation',
    failureCode: 'UNSUPPORTED_SIGNATURE',
    failureReason: 'The uploaded bytes do not match a PNG signature.',
  });

  const failedObserved: DomainEventV1<'ProcessingFailed.v1'> = {
    messageId: 'evt-processing-failed-1',
    kind: 'event',
    type: 'ProcessingFailed.v1',
    occurredAt: '2026-03-01T10:00:03.000Z',
    correlationId: uploaded.correlationId,
    causationId: rejected.messageId,
    producer: 'projection-service',
    version: 1,
    payload: {
      fileId: uploaded.payload.fileId,
      status: 'failed',
      completedSteps: ['upload'],
      failedStage: 'validation',
      failureCode: 'UNSUPPORTED_SIGNATURE',
      failureReason: 'The uploaded bytes do not match a PNG signature.',
      userId: uploaded.payload.userId,
      tenantId: uploaded.payload.tenantId,
    },
  };

  sagaState = applyProcessingSagaEvent({
    current: sagaState,
    event: failedObserved,
    timeoutMs: 300000,
  });

  assert.equal(sagaState.projectionCompletionStatus, 'failed');
  assert.equal(sagaState.comparisonStatus, 'match');
});

test('processing saga emits a timed out terminal spec when the deadline is exceeded', () => {
  const uploaded = createFileUploadedEvent();

  const validated: DomainEventV1<'FileValidated.v1'> = {
    messageId: 'evt-validated-timeout-1',
    kind: 'event',
    type: 'FileValidated.v1',
    occurredAt: '2026-03-01T10:00:01.000Z',
    correlationId: uploaded.correlationId,
    causationId: uploaded.messageId,
    producer: 'validator-service',
    version: 1,
    payload: {
      fileId: uploaded.payload.fileId,
      bucket: uploaded.payload.bucket,
      objectKey: uploaded.payload.objectKey,
      contentType: uploaded.payload.contentType,
      sizeBytes: uploaded.payload.sizeBytes,
      userId: uploaded.payload.userId,
      tenantId: uploaded.payload.tenantId,
    },
  };

  let sagaState = applyProcessingSagaEvent({
    event: uploaded,
    timeoutMs: 60000,
  });
  sagaState = applyProcessingSagaEvent({
    current: sagaState,
    event: validated,
    timeoutMs: 60000,
  });

  const timedOut = markProcessingSagaTimedOut(sagaState, '2026-03-01T10:02:00.000Z');

  assert.equal(timedOut.status, 'timed-out');
  assert.equal(timedOut.completedAt, '2026-03-01T10:02:00.000Z');
  assert.equal(timedOut.lastEventType, 'TimerExpired.shadow');
  assert.deepEqual(deriveTerminalEventSpec(timedOut), {
    type: 'ProcessingTimedOut.v1',
    status: 'failed',
    completedSteps: ['upload', 'validation'],
    pendingSteps: ['thumbnail', 'metadata'],
    timeoutAt: '2026-03-01T10:02:00.000Z',
    deadlineAt: '2026-03-01T10:01:00.000Z',
  });

  const observedTimeout: DomainEventV1<'ProcessingTimedOut.v1'> = {
    messageId: 'evt-processing-timeout-1',
    kind: 'event',
    type: 'ProcessingTimedOut.v1',
    occurredAt: '2026-03-01T10:02:01.000Z',
    correlationId: uploaded.correlationId,
    causationId: validated.messageId,
    producer: 'projection-service',
    version: 1,
    payload: {
      fileId: uploaded.payload.fileId,
      status: 'failed',
      completedSteps: ['upload', 'validation'],
      pendingSteps: ['thumbnail', 'metadata'],
      timeoutAt: '2026-03-01T10:02:00.000Z',
      deadlineAt: '2026-03-01T10:01:00.000Z',
      userId: uploaded.payload.userId,
      tenantId: uploaded.payload.tenantId,
    },
  };

  const matched = applyProcessingSagaEvent({
    current: timedOut,
    event: observedTimeout,
    timeoutMs: 60000,
  });

  assert.equal(matched.projectionCompletionStatus, 'failed');
  assert.equal(matched.comparisonStatus, 'match');
});
