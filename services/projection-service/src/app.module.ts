import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ProjectDomainEventUseCase } from './application/projection/project-domain-event.use-case';
import { PROJECTION_PROJECTOR_PORT } from './application/projection/ports/projection-projector.port';
import { ServiceInfoQuery } from './application/system/service-info.query';
import { PostgresProjectionProjectorAdapter } from './infrastructure/persistence/postgres-projection-projector.adapter';
import {
  PROJECTION_SERVICE_ENV_FILE_PATHS,
  ProjectionServiceConfigService,
  validateProjectionServiceEnvironment,
} from './infrastructure/config/projection-service-config.service';
import { AppController } from './presentation/http/app.controller';
import { RabbitMqProjectionConsumerService } from './presentation/messaging/rabbitmq-projection-consumer.service';

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
    {
      provide: PROJECTION_PROJECTOR_PORT,
      useExisting: PostgresProjectionProjectorAdapter,
    },
    ProjectDomainEventUseCase,
    RabbitMqProjectionConsumerService,
  ],
})
export class AppModule {}
