import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { AdminDlqApplicationService } from './application/admin-dlq/admin-dlq.application.service';
import { DLQ_ADMIN } from './application/admin-dlq/ports/dlq-admin.port';
import { ACCESS_TOKEN_VERIFIER } from './application/auth/ports/access-token-verifier.port';
import { PASSWORD_AUTHENTICATOR } from './application/auth/ports/password-authenticator.port';
import { SignInApplicationService } from './application/auth/sign-in.application.service';
import { COMMAND_PUBLISHER } from './application/uploads/ports/command-publisher.port';
import { UPLOAD_OBJECT_STORAGE } from './application/uploads/ports/upload-object-storage.port';
import { UPLOADS_READ_MODEL_REPOSITORY } from './application/uploads/ports/uploads-read-model.port';
import { UploadsApplicationService } from './application/uploads/uploads.application.service';
import { ServiceInfoQuery } from './application/system/service-info.query';
import { KeycloakAccessTokenVerifierService } from './infrastructure/auth/keycloak-access-token-verifier.service';
import { KeycloakPasswordAuthenticatorService } from './infrastructure/auth/keycloak-password-authenticator.service';
import {
  API_GATEWAY_ENV_FILE_PATHS,
  ApiGatewayConfigService,
  validateApiGatewayEnvironment,
} from './infrastructure/config/api-gateway-config.service';
import { RabbitMqCommandPublisherAdapter } from './infrastructure/messaging/rabbitmq-command-publisher.adapter';
import { RabbitMqManagementDlqAdminAdapter } from './infrastructure/messaging/rabbitmq-management-dlq-admin.adapter';
import { InMemoryUploadsReadModelRepository } from './infrastructure/persistence/in-memory-uploads-read-model.repository';
import { MinioUploadObjectStorageAdapter } from './infrastructure/storage/minio-upload-object-storage.adapter';
import { AdminDlqController } from './presentation/http/admin/dlq.controller';
import { AuthController } from './presentation/http/auth/auth.controller';
import { JwtAuthGuard } from './presentation/http/auth/jwt-auth.guard';
import { RolesGuard } from './presentation/http/auth/roles.guard';
import { UploadsController } from './presentation/http/uploads/uploads.controller';
import { AppController } from './presentation/http/system/app.controller';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      envFilePath: API_GATEWAY_ENV_FILE_PATHS,
      validate: validateApiGatewayEnvironment,
    }),
  ],
  controllers: [AppController, AuthController, UploadsController, AdminDlqController],
  providers: [
    ApiGatewayConfigService,
    ServiceInfoQuery,
    KeycloakAccessTokenVerifierService,
    KeycloakPasswordAuthenticatorService,
    {
      provide: ACCESS_TOKEN_VERIFIER,
      useExisting: KeycloakAccessTokenVerifierService,
    },
    {
      provide: PASSWORD_AUTHENTICATOR,
      useExisting: KeycloakPasswordAuthenticatorService,
    },
    InMemoryUploadsReadModelRepository,
    {
      provide: UPLOADS_READ_MODEL_REPOSITORY,
      useExisting: InMemoryUploadsReadModelRepository,
    },
    SignInApplicationService,
    UploadsApplicationService,
    AdminDlqApplicationService,
    RabbitMqCommandPublisherAdapter,
    {
      provide: COMMAND_PUBLISHER,
      useExisting: RabbitMqCommandPublisherAdapter,
    },
    RabbitMqManagementDlqAdminAdapter,
    {
      provide: DLQ_ADMIN,
      useExisting: RabbitMqManagementDlqAdminAdapter,
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
