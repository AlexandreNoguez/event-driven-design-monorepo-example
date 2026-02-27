import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { HandleFileValidatedUseCase } from './application/thumbnail/handle-file-validated.use-case';
import { PublishThumbnailOutboxBatchService } from './application/thumbnail/publish-thumbnail-outbox-batch.service';
import { THUMBNAIL_EVENTS_PUBLISHER_PORT } from './application/thumbnail/ports/thumbnail-events-publisher.port';
import { THUMBNAIL_IMAGE_PROCESSOR_PORT } from './application/thumbnail/ports/thumbnail-image-processor.port';
import { THUMBNAIL_OBJECT_STORAGE_PORT } from './application/thumbnail/ports/thumbnail-object-storage.port';
import { THUMBNAIL_OUTBOX_REPOSITORY_PORT } from './application/thumbnail/ports/thumbnail-outbox-repository.port';
import { THUMBNAIL_PROCESSED_EVENTS_PORT } from './application/thumbnail/ports/thumbnail-processed-events.port';
import { ServiceInfoQuery } from './application/system/service-info.query';
import { SharpThumbnailImageProcessorAdapter } from './infrastructure/imaging/sharp-thumbnail-image-processor.adapter';
import { RabbitMqThumbnailEventsPublisherAdapter } from './infrastructure/messaging/rabbitmq-thumbnail-events-publisher.adapter';
import {
  THUMBNAIL_SERVICE_ENV_FILE_PATHS,
  ThumbnailServiceConfigService,
  validateThumbnailServiceEnvironment,
} from './infrastructure/config/thumbnail-service-config.service';
import { PostgresThumbnailProcessedEventsAdapter } from './infrastructure/persistence/postgres-thumbnail-processed-events.adapter';
import { MinioThumbnailObjectStorageAdapter } from './infrastructure/storage/minio-thumbnail-object-storage.adapter';
import { AppController } from './presentation/http/app.controller';
import { RabbitMqFileValidatedConsumerService } from './presentation/messaging/rabbitmq-file-validated-consumer.service';
import { ThumbnailOutboxPollerService } from './presentation/workers/thumbnail-outbox-poller.service';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      envFilePath: THUMBNAIL_SERVICE_ENV_FILE_PATHS,
      validate: validateThumbnailServiceEnvironment,
    }),
  ],
  controllers: [AppController],
  providers: [
    ThumbnailServiceConfigService,
    ServiceInfoQuery,
    MinioThumbnailObjectStorageAdapter,
    {
      provide: THUMBNAIL_OBJECT_STORAGE_PORT,
      useExisting: MinioThumbnailObjectStorageAdapter,
    },
    SharpThumbnailImageProcessorAdapter,
    {
      provide: THUMBNAIL_IMAGE_PROCESSOR_PORT,
      useExisting: SharpThumbnailImageProcessorAdapter,
    },
    RabbitMqThumbnailEventsPublisherAdapter,
    {
      provide: THUMBNAIL_EVENTS_PUBLISHER_PORT,
      useExisting: RabbitMqThumbnailEventsPublisherAdapter,
    },
    PostgresThumbnailProcessedEventsAdapter,
    {
      provide: THUMBNAIL_PROCESSED_EVENTS_PORT,
      useExisting: PostgresThumbnailProcessedEventsAdapter,
    },
    {
      provide: THUMBNAIL_OUTBOX_REPOSITORY_PORT,
      useExisting: PostgresThumbnailProcessedEventsAdapter,
    },
    HandleFileValidatedUseCase,
    PublishThumbnailOutboxBatchService,
    RabbitMqFileValidatedConsumerService,
    ThumbnailOutboxPollerService,
  ],
})
export class AppModule {}
