import { Injectable } from '@nestjs/common';

@Injectable()
export class ServiceInfoQuery {
  getInfo() {
    return {
      service: 'notification-service',
      kind: 'worker-service',
      status: 'ok',
      timestamp: new Date().toISOString(),
    };
  }
}
