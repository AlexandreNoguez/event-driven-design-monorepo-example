import { Injectable } from '@nestjs/common';

@Injectable()
export class ServiceInfoQuery {
  getInfo() {
    return {
      service: 'api-gateway',
      kind: 'http-gateway',
      status: 'ok',
      timestamp: new Date().toISOString(),
    };
  }
}
