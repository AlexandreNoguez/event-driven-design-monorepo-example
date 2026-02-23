import { Injectable } from '@nestjs/common';

@Injectable()
export class ServiceInfoQuery {
  getInfo() {
    return {
      service: 'extractor-service',
      kind: 'worker-service',
      status: 'ok',
      timestamp: new Date().toISOString(),
    };
  }
}
