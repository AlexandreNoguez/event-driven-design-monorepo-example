import test from 'node:test';
import assert from 'node:assert/strict';
import { HandleFileUploadedUseCase } from '../../../services/validator-service/src/application/validation/handle-file-uploaded.use-case';
import type { FileObjectReaderPort } from '../../../services/validator-service/src/application/validation/ports/file-object-reader.port';
import type {
  StoreValidatorProcessedAndOutboxInput,
  ValidatorOutboxRepositoryPort,
} from '../../../services/validator-service/src/application/validation/ports/validator-outbox-repository.port';
import type { ValidatorServiceConfigService } from '../../../services/validator-service/src/infrastructure/config/validator-service-config.service';
import type { DomainEventV1 } from '../../../packages/shared/src/messaging/contracts';

function createFileUploadedEvent(): DomainEventV1<'FileUploaded.v1'> {
  return {
    messageId: 'evt-uploaded-1',
    kind: 'event',
    type: 'FileUploaded.v1',
    occurredAt: '2026-02-27T02:00:00.000Z',
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

function createConfig(): Pick<
  ValidatorServiceConfigService,
  'consumerName' | 'signatureReadBytes' | 'maxSizeBytes' | 'allowedMimeTypesCsv'
> {
  return {
    consumerName: 'validator:file-uploaded',
    signatureReadBytes: 32,
    maxSizeBytes: 1024,
    allowedMimeTypesCsv: 'image/png,image/jpeg',
  };
}

function createPngHeader(): Uint8Array {
  return new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
}

test('HandleFileUploadedUseCase stores FileValidated in outbox for valid files', async () => {
  const persistedInputs: StoreValidatorProcessedAndOutboxInput[] = [];

  const fileObjectReader: FileObjectReaderPort = {
    async statObject() {
      return { sizeBytes: 68, eTag: 'etag-1' };
    },
    async readObjectHeader() {
      return createPngHeader();
    },
  };

  const outboxRepository: ValidatorOutboxRepositoryPort = {
    async storeProcessedEventAndOutbox(input) {
      persistedInputs.push(input);
      return { applied: true };
    },
    async findPendingOutboxEvents() {
      return [];
    },
    async markOutboxEventPublished() {},
    async markOutboxEventPublishFailed() {},
  };

  const useCase = new HandleFileUploadedUseCase(
    fileObjectReader,
    outboxRepository,
    createConfig() as ValidatorServiceConfigService,
  );

  const result = await useCase.execute(createFileUploadedEvent());

  assert.deepEqual(result, {
    skipped: false,
    publishedType: 'FileValidated.v1',
  });
  assert.equal(persistedInputs.length, 1);
  assert.equal(persistedInputs[0]?.routingKey, 'files.validated.v1');
  assert.equal(persistedInputs[0]?.outboxEvent.type, 'FileValidated.v1');
  assert.equal(
    persistedInputs[0]?.outboxEvent.payload.checksum,
    'md5:etag-1',
  );
});

test('HandleFileUploadedUseCase stores FileRejected in outbox when signature is invalid', async () => {
  const persistedInputs: StoreValidatorProcessedAndOutboxInput[] = [];

  const fileObjectReader: FileObjectReaderPort = {
    async statObject() {
      return { sizeBytes: 68, eTag: 'etag-2' };
    },
    async readObjectHeader() {
      return new Uint8Array([0x00, 0x11, 0x22, 0x33]);
    },
  };

  const outboxRepository: ValidatorOutboxRepositoryPort = {
    async storeProcessedEventAndOutbox(input) {
      persistedInputs.push(input);
      return { applied: true };
    },
    async findPendingOutboxEvents() {
      return [];
    },
    async markOutboxEventPublished() {},
    async markOutboxEventPublishFailed() {},
  };

  const useCase = new HandleFileUploadedUseCase(
    fileObjectReader,
    outboxRepository,
    createConfig() as ValidatorServiceConfigService,
  );

  const result = await useCase.execute(createFileUploadedEvent());

  assert.deepEqual(result, {
    skipped: false,
    publishedType: 'FileRejected.v1',
  });
  assert.equal(persistedInputs.length, 1);
  assert.equal(persistedInputs[0]?.routingKey, 'files.rejected.v1');
  assert.equal(persistedInputs[0]?.outboxEvent.type, 'FileRejected.v1');
  assert.equal(
    persistedInputs[0]?.outboxEvent.payload.code,
    'INVALID_SIGNATURE',
  );
});

test('HandleFileUploadedUseCase skips duplicate events when repository reports applied=false', async () => {
  const fileObjectReader: FileObjectReaderPort = {
    async statObject() {
      return { sizeBytes: 68 };
    },
    async readObjectHeader() {
      return createPngHeader();
    },
  };

  const outboxRepository: ValidatorOutboxRepositoryPort = {
    async storeProcessedEventAndOutbox() {
      return { applied: false };
    },
    async findPendingOutboxEvents() {
      return [];
    },
    async markOutboxEventPublished() {},
    async markOutboxEventPublishFailed() {},
  };

  const useCase = new HandleFileUploadedUseCase(
    fileObjectReader,
    outboxRepository,
    createConfig() as ValidatorServiceConfigService,
  );

  const result = await useCase.execute(createFileUploadedEvent());

  assert.deepEqual(result, { skipped: true });
});
