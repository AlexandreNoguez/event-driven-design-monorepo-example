import { Controller, Get } from '@nestjs/common';
import { ServiceInfoQuery } from '../../../application/system/service-info.query';
import { Public } from '../auth/public.decorator';

@Controller()
export class AppController {
  constructor(private readonly serviceInfoQuery: ServiceInfoQuery) {}

  @Public()
  @Get()
  getRoot() {
    return this.serviceInfoQuery.getInfo();
  }

  @Public()
  @Get('health')
  getHealth() {
    return this.serviceInfoQuery.getInfo();
  }
}
