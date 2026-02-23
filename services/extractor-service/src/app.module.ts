import { Module } from '@nestjs/common';
import { HandleFileValidatedUseCase } from './application/extractor/handle-file-validated.use-case';
import { EXTRACTOR_EVENTS_PUBLISHER_PORT } from './application/extractor/ports/extractor-events-publisher.port';
import { EXTRACTOR_OBJECT_STORAGE_PORT } from './application/extractor/ports/extractor-object-storage.port';
import { EXTRACTOR_PROCESSED_EVENTS_PORT } from './application/extractor/ports/extractor-processed-events.port';
import { IMAGE_METADATA_READER_PORT } from './application/extractor/ports/image-metadata-reader.port';
import { ServiceInfoQuery } from './application/system/service-info.query';
import { SharpImageMetadataReaderAdapter } from './infrastructure/imaging/sharp-image-metadata-reader.adapter';
import { RabbitMqExtractorEventsPublisherAdapter } from './infrastructure/messaging/rabbitmq-extractor-events-publisher.adapter';
import { PostgresExtractorProcessedEventsAdapter } from './infrastructure/persistence/postgres-extractor-processed-events.adapter';
import { MinioExtractorObjectStorageAdapter } from './infrastructure/storage/minio-extractor-object-storage.adapter';
import { AppController } from './presentation/http/app.controller';
import { RabbitMqFileValidatedConsumerService } from './presentation/messaging/rabbitmq-file-validated-consumer.service';

@Module({
  imports: [],
  controllers: [AppController],
  providers: [
    ServiceInfoQuery,
    MinioExtractorObjectStorageAdapter,
    {
      provide: EXTRACTOR_OBJECT_STORAGE_PORT,
      useExisting: MinioExtractorObjectStorageAdapter,
    },
    SharpImageMetadataReaderAdapter,
    {
      provide: IMAGE_METADATA_READER_PORT,
      useExisting: SharpImageMetadataReaderAdapter,
    },
    RabbitMqExtractorEventsPublisherAdapter,
    {
      provide: EXTRACTOR_EVENTS_PUBLISHER_PORT,
      useExisting: RabbitMqExtractorEventsPublisherAdapter,
    },
    PostgresExtractorProcessedEventsAdapter,
    {
      provide: EXTRACTOR_PROCESSED_EVENTS_PORT,
      useExisting: PostgresExtractorProcessedEventsAdapter,
    },
    HandleFileValidatedUseCase,
    RabbitMqFileValidatedConsumerService,
  ],
})
export class AppModule {}
