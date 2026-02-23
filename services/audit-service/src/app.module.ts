import { Module } from '@nestjs/common';
import { RecordAuditableEventUseCase } from './application/audit/record-auditable-event.use-case';
import { AUDIT_REPOSITORY_PORT } from './application/audit/ports/audit-repository.port';
import { ServiceInfoQuery } from './application/system/service-info.query';
import { PostgresAuditRepository } from './infrastructure/persistence/postgres-audit.repository';
import { AppController } from './presentation/http/app.controller';
import { RabbitMqAuditConsumerService } from './presentation/messaging/rabbitmq-audit-consumer.service';

@Module({
  imports: [],
  controllers: [AppController],
  providers: [
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
