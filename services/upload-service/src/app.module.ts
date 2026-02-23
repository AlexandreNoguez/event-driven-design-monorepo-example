import { Module } from '@nestjs/common';
import { HandleUploadRequestedUseCase } from './application/uploads/handle-upload-requested.use-case';
import { PublishUploadOutboxBatchService } from './application/uploads/publish-upload-outbox-batch.service';
import { UPLOAD_EVENTS_PUBLISHER_PORT } from './application/uploads/ports/events-publisher.port';
import { UPLOAD_REPOSITORY_PORT } from './application/uploads/ports/upload-repository.port';
import { ServiceInfoQuery } from './application/system/service-info.query';
import { RabbitMqUploadEventsPublisherAdapter } from './infrastructure/messaging/rabbitmq-events-publisher.adapter';
import { PostgresUploadRepository } from './infrastructure/persistence/postgres-upload.repository';
import { RabbitMqCommandConsumerService } from './presentation/messaging/rabbitmq-command-consumer.service';
import { AppController } from './presentation/http/system/app.controller';
import { UploadOutboxPollerService } from './presentation/workers/upload-outbox-poller.service';

@Module({
  imports: [],
  controllers: [AppController],
  providers: [
    ServiceInfoQuery,
    PostgresUploadRepository,
    {
      provide: UPLOAD_REPOSITORY_PORT,
      useExisting: PostgresUploadRepository,
    },
    RabbitMqUploadEventsPublisherAdapter,
    {
      provide: UPLOAD_EVENTS_PUBLISHER_PORT,
      useExisting: RabbitMqUploadEventsPublisherAdapter,
    },
    HandleUploadRequestedUseCase,
    PublishUploadOutboxBatchService,
    UploadOutboxPollerService,
    RabbitMqCommandConsumerService,
  ],
})
export class AppModule {}
