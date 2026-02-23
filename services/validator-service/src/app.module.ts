import { Module } from '@nestjs/common';
import { ServiceInfoQuery } from './application/system/service-info.query';
import { AppController } from './presentation/http/app.controller';

@Module({
  imports: [],
  controllers: [AppController],
  providers: [ServiceInfoQuery],
})
export class AppModule {}
