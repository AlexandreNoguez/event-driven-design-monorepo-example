import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { AdminDlqApplicationService } from '../../../application/admin-dlq/admin-dlq.application.service';
import type { AuthenticatedUser } from '../../../domain/auth/authenticated-user';
import { CurrentUser } from '../auth/current-user.decorator';
import { Roles } from '../auth/roles.decorator';
import type { AdminDlqPeekQuery, AdminDlqRedriveBody } from './dlq.http-types';

@Roles('admin')
@Controller('admin/dlq')
export class AdminDlqController {
  constructor(private readonly service: AdminDlqApplicationService) {}

  @Get('queues')
  async listQueues() {
    return this.service.listQueues();
  }

  @Get('queues/:queue/messages')
  async peekMessages(
    @Param('queue') queue: string,
    @Query() query: AdminDlqPeekQuery,
  ) {
    return this.service.peekQueueMessages({
      queue,
      limit: query?.limit,
    });
  }

  @Post('queues/:queue/re-drive')
  async redriveMessages(
    @Param('queue') queue: string,
    @Body() body: AdminDlqRedriveBody,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.service.redriveQueueMessages({
      queue,
      limit: body?.limit,
      requestedByUserId: user.subject,
      requestedByUserName: user.username,
    });
  }
}

