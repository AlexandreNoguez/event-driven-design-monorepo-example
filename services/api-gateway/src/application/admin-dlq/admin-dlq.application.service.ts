import { BadRequestException, Inject, Injectable, Logger } from '@nestjs/common';
import { createJsonLogEntry } from '@event-pipeline/shared';
import { resolveKnownDlqQueueTarget } from '../../domain/admin/dlq-queue';
import {
  DLQ_ADMIN,
  type DlqAdminPort,
} from './ports/dlq-admin.port';

const DEFAULT_LIST_LIMIT = 20;
const MAX_LIST_LIMIT = 100;
const DEFAULT_REDRIVE_LIMIT = 10;
const MAX_REDRIVE_LIMIT = 100;

@Injectable()
export class AdminDlqApplicationService {
  private readonly logger = new Logger(AdminDlqApplicationService.name);

  constructor(@Inject(DLQ_ADMIN) private readonly dlqAdmin: DlqAdminPort) {}

  async listQueues() {
    const queues = await this.dlqAdmin.listQueues();
    return {
      items: queues.sort((a, b) => a.queue.localeCompare(b.queue)),
      total: queues.length,
    };
  }

  async peekQueueMessages(input: { queue: string; limit?: number | string }) {
    const target = this.requireKnownQueue(input.queue);
    const limit = this.parseLimit(input.limit, DEFAULT_LIST_LIMIT, MAX_LIST_LIMIT, 'limit');
    const items = await this.dlqAdmin.peekMessages({
      queue: target.dlqQueue,
      limit,
    });

    return {
      queue: target.dlqQueue,
      mainQueue: target.mainQueue,
      retryExchange: target.retryExchange,
      requested: limit,
      returned: items.length,
      items,
    };
  }

  async redriveQueueMessages(input: {
    queue: string;
    limit?: number | string;
    requestedByUserId: string;
    requestedByUserName: string;
  }) {
    const target = this.requireKnownQueue(input.queue);
    const limit = this.parseLimit(input.limit, DEFAULT_REDRIVE_LIMIT, MAX_REDRIVE_LIMIT, 'limit');

    const result = await this.dlqAdmin.redriveMessages({
      queue: target.dlqQueue,
      limit,
      requestedByUserId: input.requestedByUserId,
      requestedByUserName: input.requestedByUserName,
    });

    this.logger.warn(JSON.stringify(createJsonLogEntry({
      level: 'warn',
      service: 'api-gateway',
      message: 'DLQ re-drive requested.',
      correlationId: 'system',
      userId: input.requestedByUserId,
      queue: target.dlqQueue,
      metadata: {
        requestedByUserName: input.requestedByUserName,
        moved: result.moved,
        failed: result.failed,
        requested: result.requested,
        fetched: result.fetched,
        retryExchange: result.retryExchange,
      },
    })));

    return result;
  }

  private requireKnownQueue(queue: string) {
    const normalized = String(queue ?? '').trim();
    const target = resolveKnownDlqQueueTarget(normalized);
    if (!target) {
      throw new BadRequestException(`Unsupported DLQ queue "${queue}".`);
    }
    return target;
  }

  private parseLimit(value: number | string | undefined, fallback: number, max: number, field: string): number {
    if (value === undefined || value === null || value === '') {
      return fallback;
    }
    const parsed = typeof value === 'number' ? value : Number.parseInt(String(value), 10);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      throw new BadRequestException(`${field} must be a positive integer.`);
    }
    if (parsed > max) {
      throw new BadRequestException(`${field} must be <= ${max}.`);
    }
    return Math.trunc(parsed);
  }
}
