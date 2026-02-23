import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { HandleNotificationEventUseCase } from './application/notification/handle-notification-event.use-case';
import { NOTIFICATION_MAILER_PORT } from './application/notification/ports/notification-mailer.port';
import { NOTIFICATION_REPOSITORY_PORT } from './application/notification/ports/notification-repository.port';
import { ServiceInfoQuery } from './application/system/service-info.query';
import { SmtpNotificationMailerAdapter } from './infrastructure/email/smtp-notification-mailer.adapter';
import {
  NOTIFICATION_SERVICE_ENV_FILE_PATHS,
  NotificationServiceConfigService,
  validateNotificationServiceEnvironment,
} from './infrastructure/config/notification-service-config.service';
import { PostgresNotificationRepository } from './infrastructure/persistence/postgres-notification.repository';
import { AppController } from './presentation/http/app.controller';
import { RabbitMqNotificationConsumerService } from './presentation/messaging/rabbitmq-notification-consumer.service';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      envFilePath: NOTIFICATION_SERVICE_ENV_FILE_PATHS,
      validate: validateNotificationServiceEnvironment,
    }),
  ],
  controllers: [AppController],
  providers: [
    NotificationServiceConfigService,
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
