import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PublishProjectionOutboxBatchService } from './application/projection/publish-projection-outbox-batch.service';
import { ProjectDomainEventUseCase } from './application/projection/project-domain-event.use-case';
import { MarkProcessingSagasTimedOutUseCase } from './application/process-manager/mark-processing-sagas-timed-out.use-case';
import {
  PROCESSING_SAGA_REPOSITORY_PORT,
} from './application/process-manager/ports/processing-saga-repository.port';
import { TrackProcessingSagaUseCase } from './application/process-manager/track-processing-saga.use-case';
import { PROJECTION_EVENTS_PUBLISHER_PORT } from './application/projection/ports/projection-events-publisher.port';
import { PROJECTION_OUTBOX_REPOSITORY_PORT } from './application/projection/ports/projection-outbox-repository.port';
import { PROJECTION_PROJECTOR_PORT } from './application/projection/ports/projection-projector.port';
import { ServiceInfoQuery } from './application/system/service-info.query';
import { RabbitMqProjectionEventsPublisherAdapter } from './infrastructure/messaging/rabbitmq-projection-events-publisher.adapter';
import { PostgresProcessingSagaRepository } from './infrastructure/persistence/postgres-processing-saga.repository';
import { PostgresProjectionProjectorAdapter } from './infrastructure/persistence/postgres-projection-projector.adapter';
import {
  PROJECTION_SERVICE_ENV_FILE_PATHS,
  ProjectionServiceConfigService,
  validateProjectionServiceEnvironment,
} from './infrastructure/config/projection-service-config.service';
import { AppController } from './presentation/http/app.controller';
import { RabbitMqProjectionConsumerService } from './presentation/messaging/rabbitmq-projection-consumer.service';
import { ProcessingSagaTimeoutSweeperService } from './presentation/workers/processing-saga-timeout-sweeper.service';
import { ProjectionOutboxPollerService } from './presentation/workers/projection-outbox-poller.service';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      envFilePath: PROJECTION_SERVICE_ENV_FILE_PATHS,
      validate: validateProjectionServiceEnvironment,
    }),
  ],
  controllers: [AppController],
  providers: [
    ProjectionServiceConfigService,
    ServiceInfoQuery,
    PostgresProjectionProjectorAdapter,
    PostgresProcessingSagaRepository,
    RabbitMqProjectionEventsPublisherAdapter,
    {
      provide: PROJECTION_PROJECTOR_PORT,
      useExisting: PostgresProjectionProjectorAdapter,
    },
    {
      provide: PROJECTION_OUTBOX_REPOSITORY_PORT,
      useExisting: PostgresProjectionProjectorAdapter,
    },
    {
      provide: PROJECTION_EVENTS_PUBLISHER_PORT,
      useExisting: RabbitMqProjectionEventsPublisherAdapter,
    },
    {
      provide: PROCESSING_SAGA_REPOSITORY_PORT,
      useExisting: PostgresProcessingSagaRepository,
    },
    ProjectDomainEventUseCase,
    TrackProcessingSagaUseCase,
    MarkProcessingSagasTimedOutUseCase,
    PublishProjectionOutboxBatchService,
    RabbitMqProjectionConsumerService,
    ProjectionOutboxPollerService,
    ProcessingSagaTimeoutSweeperService,
  ],
})
export class AppModule {}
