import test from 'node:test';
import assert from 'node:assert/strict';
import { UploadsApplicationService } from '../../../services/api-gateway/src/application/uploads/uploads.application.service';
import type { CommandPublisher } from '../../../services/api-gateway/src/application/uploads/ports/command-publisher.port';
import type { UploadObjectStorage } from '../../../services/api-gateway/src/application/uploads/ports/upload-object-storage.port';
import type { UploadsReadModelRepository } from '../../../services/api-gateway/src/application/uploads/ports/uploads-read-model.port';
import type { ApiGatewayConfigService } from '../../../services/api-gateway/src/infrastructure/config/api-gateway-config.service';
import type { AuthenticatedUser } from '../../../services/api-gateway/src/domain/auth/authenticated-user';
import type { ApiUploadRecord } from '../../../services/api-gateway/src/domain/uploads/upload-record';

const baseUser: AuthenticatedUser = {
  subject: 'user-1',
  username: 'demo-user',
  email: 'demo-user@local.test',
  tenantId: 'tenant-1',
  roles: ['user'],
  rawClaims: {},
};

function createRecord(overrides: Partial<ApiUploadRecord> = {}): ApiUploadRecord {
  return {
    fileId: 'file-1',
    correlationId: 'corr-1',
    userId: 'user-1',
    userName: 'demo-user',
    tenantId: 'tenant-1',
    fileName: 'sample.png',
    contentType: 'image/png',
    sizeBytes: 68,
    status: 'upload-url-issued',
    createdAt: '2026-02-27T02:00:00.000Z',
    updatedAt: '2026-02-27T02:00:01.000Z',
    reprocessCount: 0,
    lastCommand: 'UploadSessionInitiated.local',
    timeline: [],
    ...overrides,
  };
}

function createRepository(): UploadsReadModelRepository {
  return {
    upsertInitiated(input) {
      return createRecord({
        fileId: input.fileId,
        correlationId: input.correlationId,
        fileName: input.fileName,
        contentType: input.contentType,
        sizeBytes: input.sizeBytes,
        userId: input.userId,
        userName: input.userName,
        tenantId: input.tenantId,
      });
    },
    upsertRequested(input) {
      return createRecord({
        fileId: input.fileId,
        correlationId: input.correlationId,
        fileName: input.fileName,
        contentType: input.contentType,
        sizeBytes: input.sizeBytes,
        userId: input.userId,
        userName: input.userName,
        tenantId: input.tenantId,
        status: 'upload-requested',
        lastCommand: 'UploadRequested.v1',
      });
    },
    markReprocessRequested(input) {
      return createRecord({
        fileId: input.fileId,
        correlationId: input.correlationId,
        status: 'reprocess-requested',
        reprocessCount: 1,
        lastCommand: 'ReprocessFileRequested.v1',
      });
    },
    getById() {
      return createRecord();
    },
    list() {
      return [createRecord()];
    },
  };
}

function createStorage(): UploadObjectStorage {
  return {
    resolveUploadObjectRef(input) {
      return {
        bucket: 'uploads',
        objectKey: `raw/${input.fileId}/${input.fileName}`,
      };
    },
    async createPresignedUploadUrl(input) {
      return {
        bucket: 'uploads',
        objectKey: `raw/${input.fileId}/${input.fileName}`,
        url: `http://minio.local/${input.fileId}`,
        expiresAt: '2026-02-27T03:00:00.000Z',
        method: 'PUT',
        requiredHeaders: {
          'content-type': input.contentType,
        },
      };
    },
    async statUploadedObject(input) {
      return {
        bucket: input.bucket,
        objectKey: input.objectKey,
        sizeBytes: 68,
        eTag: '"etag-1"',
        contentType: 'image/png',
      };
    },
  };
}

function createPublisher(): CommandPublisher {
  return {
    async publishCommand() {},
  };
}

function createConfig(overrides?: Partial<Pick<ApiGatewayConfigService, 'uploadMaxSizeBytes' | 'allowedUploadMimeTypes'>>) {
  return {
    uploadMaxSizeBytes: 1024,
    allowedUploadMimeTypes: ['image/png', 'image/jpeg'],
    ...overrides,
  } as ApiGatewayConfigService;
}

test('UploadsApplicationService issues a presigned upload URL for valid input', async () => {
  const service = new UploadsApplicationService(
    createRepository(),
    createPublisher(),
    createStorage(),
    createConfig(),
  );

  const result = await service.requestUpload({
    fileName: 'sample.png',
    contentType: 'image/png',
    sizeBytes: 68,
    user: baseUser,
    correlationId: 'corr-1',
  });

  assert.equal(typeof result.fileId, 'string');
  assert.ok(result.fileId.length > 0);
  assert.equal(result.correlationId, 'corr-1');
  assert.equal(result.status, 'upload-url-issued');
  assert.equal(result.upload.method, 'PUT');
  assert.equal(result.next.confirmEndpoint, `/uploads/${result.fileId}/confirm`);
});

test('UploadsApplicationService rejects disallowed MIME types before issuing a URL', async () => {
  const service = new UploadsApplicationService(
    createRepository(),
    createPublisher(),
    createStorage(),
    createConfig(),
  );

  await assert.rejects(
    () =>
      service.requestUpload({
        fileName: 'sample.svg',
        contentType: 'image/svg+xml',
        sizeBytes: 68,
        user: baseUser,
      }),
    (error: unknown) => {
      assert.equal(typeof error, 'object');
      assert.ok(error !== null);
      assert.match(String((error as { message?: unknown }).message), /not allowed/i);
      return true;
    },
  );
});
