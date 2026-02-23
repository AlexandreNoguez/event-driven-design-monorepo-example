import { Controller, Get } from '@nestjs/common';
import { ServiceInfoQuery } from '../../../application/system/service-info.query';

@Controller()
export class AppController {
  constructor(private readonly serviceInfoQuery: ServiceInfoQuery) {}

  @Get()
  getRoot() {
    return this.serviceInfoQuery.getInfo();
  }

  @Get('health')
  getHealth() {
    return this.serviceInfoQuery.getInfo();
  }
}
