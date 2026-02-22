import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

const SERVICE_NAME = 'projection-service';
const PORT_ENV = 'PROJECTION_SERVICE_PORT';
const DEFAULT_PORT = 3001;

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const rawPort = process.env[PORT_ENV];
  const parsedPort = rawPort ? Number.parseInt(rawPort, 10) : DEFAULT_PORT;
  const port = Number.isFinite(parsedPort) ? parsedPort : DEFAULT_PORT;

  await app.listen(port);

  const logger = new Logger('Bootstrap');
  logger.log(`${SERVICE_NAME} listening on port ${port}`);
}

bootstrap().catch((error: unknown) => {
  const logger = new Logger('Bootstrap');
  logger.error(`Failed to start ${SERVICE_NAME}`, error instanceof Error ? error.stack : String(error));
  process.exitCode = 1;
});
