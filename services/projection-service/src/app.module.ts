import { Module } from '@nestjs/common';
import { ProjectDomainEventUseCase } from './application/projection/project-domain-event.use-case';
import { PROJECTION_PROJECTOR_PORT } from './application/projection/ports/projection-projector.port';
import { ServiceInfoQuery } from './application/system/service-info.query';
import { PostgresProjectionProjectorAdapter } from './infrastructure/persistence/postgres-projection-projector.adapter';
import { AppController } from './presentation/http/app.controller';
import { RabbitMqProjectionConsumerService } from './presentation/messaging/rabbitmq-projection-consumer.service';

@Module({
  imports: [],
  controllers: [AppController],
  providers: [
    ServiceInfoQuery,
    PostgresProjectionProjectorAdapter,
    {
      provide: PROJECTION_PROJECTOR_PORT,
      useExisting: PostgresProjectionProjectorAdapter,
    },
    ProjectDomainEventUseCase,
    RabbitMqProjectionConsumerService,
  ],
})
export class AppModule {}
