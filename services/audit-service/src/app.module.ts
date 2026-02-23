import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { RecordAuditableEventUseCase } from './application/audit/record-auditable-event.use-case';
import { AUDIT_REPOSITORY_PORT } from './application/audit/ports/audit-repository.port';
import { ServiceInfoQuery } from './application/system/service-info.query';
import { PostgresAuditRepository } from './infrastructure/persistence/postgres-audit.repository';
import {
  AUDIT_SERVICE_ENV_FILE_PATHS,
  AuditServiceConfigService,
  validateAuditServiceEnvironment,
} from './infrastructure/config/audit-service-config.service';
import { AppController } from './presentation/http/app.controller';
import { RabbitMqAuditConsumerService } from './presentation/messaging/rabbitmq-audit-consumer.service';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      envFilePath: AUDIT_SERVICE_ENV_FILE_PATHS,
      validate: validateAuditServiceEnvironment,
    }),
  ],
  controllers: [AppController],
  providers: [
    AuditServiceConfigService,
    ServiceInfoQuery,
    PostgresAuditRepository,
    {
      provide: AUDIT_REPOSITORY_PORT,
      useExisting: PostgresAuditRepository,
    },
    RecordAuditableEventUseCase,
    RabbitMqAuditConsumerService,
  ],
})
export class AppModule {}
