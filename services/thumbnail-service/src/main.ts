import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ThumbnailServiceConfigService } from './infrastructure/config/thumbnail-service-config.service';

const SERVICE_NAME = 'thumbnail-service';
async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.enableShutdownHooks();
  const config = app.get(ThumbnailServiceConfigService);
  const port = config.port;

  await app.listen(port);

  const logger = new Logger('Bootstrap');
  logger.log(`${SERVICE_NAME} listening on port ${port}`);
}

bootstrap().catch((error: unknown) => {
  const logger = new Logger('Bootstrap');
  logger.error(`Failed to start ${SERVICE_NAME}`, error instanceof Error ? error.stack : String(error));
  process.exitCode = 1;
});
