import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { createJsonLogEntry } from '@event-pipeline/shared';
import { AppModule } from './app.module';
import { ApiGatewayConfigService } from './infrastructure/config/api-gateway-config.service';
import { HttpExceptionFilter } from './presentation/http/common/http-exception.filter';

const SERVICE_NAME = 'api-gateway';
async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.enableCors();
  app.useGlobalFilters(new HttpExceptionFilter());
  const config = app.get(ApiGatewayConfigService);
  const port = config.port;

  app.enableShutdownHooks();
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
