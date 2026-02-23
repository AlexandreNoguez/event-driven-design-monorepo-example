import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ACCESS_TOKEN_VERIFIER } from './application/auth/ports/access-token-verifier.port';
import { COMMAND_PUBLISHER } from './application/uploads/ports/command-publisher.port';
import { UPLOAD_OBJECT_STORAGE } from './application/uploads/ports/upload-object-storage.port';
import { UPLOADS_READ_MODEL_REPOSITORY } from './application/uploads/ports/uploads-read-model.port';
import { UploadsApplicationService } from './application/uploads/uploads.application.service';
import { ServiceInfoQuery } from './application/system/service-info.query';
import { KeycloakAccessTokenVerifierService } from './infrastructure/auth/keycloak-access-token-verifier.service';
import { RabbitMqCommandPublisherAdapter } from './infrastructure/messaging/rabbitmq-command-publisher.adapter';
import { InMemoryUploadsReadModelRepository } from './infrastructure/persistence/in-memory-uploads-read-model.repository';
import { MinioUploadObjectStorageAdapter } from './infrastructure/storage/minio-upload-object-storage.adapter';
import { JwtAuthGuard } from './presentation/http/auth/jwt-auth.guard';
import { RolesGuard } from './presentation/http/auth/roles.guard';
import { UploadsController } from './presentation/http/uploads/uploads.controller';
import { AppController } from './presentation/http/system/app.controller';

@Module({
  imports: [],
  controllers: [AppController, UploadsController],
  providers: [
    ServiceInfoQuery,
    KeycloakAccessTokenVerifierService,
    {
      provide: ACCESS_TOKEN_VERIFIER,
      useExisting: KeycloakAccessTokenVerifierService,
    },
    InMemoryUploadsReadModelRepository,
    {
      provide: UPLOADS_READ_MODEL_REPOSITORY,
      useExisting: InMemoryUploadsReadModelRepository,
    },
    UploadsApplicationService,
    RabbitMqCommandPublisherAdapter,
    {
      provide: COMMAND_PUBLISHER,
      useExisting: RabbitMqCommandPublisherAdapter,
    },
    MinioUploadObjectStorageAdapter,
    {
      provide: UPLOAD_OBJECT_STORAGE,
      useExisting: MinioUploadObjectStorageAdapter,
    },
    {
      provide: APP_GUARD,
      useClass: JwtAuthGuard,
    },
    {
      provide: APP_GUARD,
      useClass: RolesGuard,
    },
  ],
})
export class AppModule {}
