import { Injectable } from '@nestjs/common';

@Injectable()
export class AppService {
  getInfo() {
    return {
      service: 'projection-service',
      kind: 'read-model-service',
      status: 'ok',
      timestamp: new Date().toISOString(),
    };
  }
}
