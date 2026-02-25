import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { createJsonLogEntry } from '@event-pipeline/shared';
import { AppModule } from './app.module';
import { NotificationServiceConfigService } from './infrastructure/config/notification-service-config.service';

const SERVICE_NAME = 'notification-service';
async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.enableShutdownHooks();
  const config = app.get(NotificationServiceConfigService);
  const port = config.port;

  await app.listen(port);

  const logger = new Logger('Bootstrap');
  logger.log(JSON.stringify(createJsonLogEntry({
    level: 'info',
    service: SERVICE_NAME,
    message: `${SERVICE_NAME} listening on port ${port}`,
    correlationId: 'system',
    metadata: { port },
  })));
}

bootstrap().catch((error: unknown) => {
  const logger = new Logger('Bootstrap');
  logger.error(JSON.stringify(createJsonLogEntry({
    level: 'error',
    service: SERVICE_NAME,
    message: `Failed to start ${SERVICE_NAME}`,
    correlationId: 'system',
    error,
  })));
  process.exitCode = 1;
});
