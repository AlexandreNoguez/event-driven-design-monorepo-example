import { Module } from '@nestjs/common';
import { HandleNotificationEventUseCase } from './application/notification/handle-notification-event.use-case';
import { NOTIFICATION_MAILER_PORT } from './application/notification/ports/notification-mailer.port';
import { NOTIFICATION_REPOSITORY_PORT } from './application/notification/ports/notification-repository.port';
import { ServiceInfoQuery } from './application/system/service-info.query';
import { SmtpNotificationMailerAdapter } from './infrastructure/email/smtp-notification-mailer.adapter';
import { PostgresNotificationRepository } from './infrastructure/persistence/postgres-notification.repository';
import { AppController } from './presentation/http/app.controller';
import { RabbitMqNotificationConsumerService } from './presentation/messaging/rabbitmq-notification-consumer.service';

@Module({
  imports: [],
  controllers: [AppController],
  providers: [
    ServiceInfoQuery,
    PostgresNotificationRepository,
    {
      provide: NOTIFICATION_REPOSITORY_PORT,
      useExisting: PostgresNotificationRepository,
    },
    SmtpNotificationMailerAdapter,
    {
      provide: NOTIFICATION_MAILER_PORT,
      useExisting: SmtpNotificationMailerAdapter,
    },
    HandleNotificationEventUseCase,
    RabbitMqNotificationConsumerService,
  ],
})
export class AppModule {}
