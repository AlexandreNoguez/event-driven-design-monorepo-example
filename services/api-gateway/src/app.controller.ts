import { Controller, Get } from '@nestjs/common';
import { Public } from './auth/public.decorator';
import { AppService } from './app.service';

@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Public()
  @Get()
  getRoot() {
    return this.appService.getInfo();
  }

  @Public()
  @Get('health')
  getHealth() {
    return this.appService.getInfo();
  }
}
