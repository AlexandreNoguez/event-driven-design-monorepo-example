import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { JwtAuthGuard } from './auth/jwt-auth.guard';
import { KeycloakJwtVerifierService } from './auth/keycloak-jwt-verifier.service';
import { RolesGuard } from './auth/roles.guard';
import { RabbitMqPublisherService } from './messaging/rabbitmq-publisher.service';
import { UploadsController } from './uploads/uploads.controller';
import { UploadsService } from './uploads/uploads.service';
import { UploadsStore } from './uploads/uploads.store';

@Module({
  imports: [],
  controllers: [AppController, UploadsController],
  providers: [
    AppService,
    KeycloakJwtVerifierService,
    UploadsStore,
    UploadsService,
    RabbitMqPublisherService,
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
