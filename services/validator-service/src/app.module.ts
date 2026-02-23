import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { HandleFileUploadedUseCase } from './application/validation/handle-file-uploaded.use-case';
import { FILE_OBJECT_READER_PORT } from './application/validation/ports/file-object-reader.port';
import { VALIDATOR_EVENTS_PUBLISHER_PORT } from './application/validation/ports/validator-events-publisher.port';
import { VALIDATOR_PROCESSED_EVENTS_PORT } from './application/validation/ports/validator-processed-events.port';
import { ServiceInfoQuery } from './application/system/service-info.query';
import { RabbitMqValidatorEventsPublisherAdapter } from './infrastructure/messaging/rabbitmq-validator-events-publisher.adapter';
import {
  VALIDATOR_SERVICE_ENV_FILE_PATHS,
  ValidatorServiceConfigService,
  validateValidatorServiceEnvironment,
} from './infrastructure/config/validator-service-config.service';
import { PostgresValidatorProcessedEventsAdapter } from './infrastructure/persistence/postgres-validator-processed-events.adapter';
import { MinioFileObjectReaderAdapter } from './infrastructure/storage/minio-file-object-reader.adapter';
import { AppController } from './presentation/http/app.controller';
import { RabbitMqFileUploadedConsumerService } from './presentation/messaging/rabbitmq-file-uploaded-consumer.service';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      envFilePath: VALIDATOR_SERVICE_ENV_FILE_PATHS,
      validate: validateValidatorServiceEnvironment,
    }),
  ],
  controllers: [AppController],
  providers: [
    ValidatorServiceConfigService,
    ServiceInfoQuery,
    MinioFileObjectReaderAdapter,
    {
      provide: FILE_OBJECT_READER_PORT,
      useExisting: MinioFileObjectReaderAdapter,
    },
    RabbitMqValidatorEventsPublisherAdapter,
    {
      provide: VALIDATOR_EVENTS_PUBLISHER_PORT,
      useExisting: RabbitMqValidatorEventsPublisherAdapter,
    },
    PostgresValidatorProcessedEventsAdapter,
    {
      provide: VALIDATOR_PROCESSED_EVENTS_PORT,
      useExisting: PostgresValidatorProcessedEventsAdapter,
    },
    HandleFileUploadedUseCase,
    RabbitMqFileUploadedConsumerService,
  ],
})
export class AppModule {}
