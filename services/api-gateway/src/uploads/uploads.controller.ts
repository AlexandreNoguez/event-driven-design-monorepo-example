import {
  Body,
  Controller,
  Get,
  Headers,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AuthenticatedUser } from '../auth/auth.types';
import { Roles } from '../auth/roles.decorator';
import type { CreateUploadRequestBody, ReprocessUploadRequestBody } from './uploads.types';
import { UploadsService } from './uploads.service';

@Controller()
export class UploadsController {
  constructor(private readonly uploadsService: UploadsService) {}

  @Post('uploads')
  async createUpload(
    @Body() body: CreateUploadRequestBody,
    @CurrentUser() user: AuthenticatedUser,
    @Headers('x-correlation-id') correlationId?: string,
  ) {
    return this.uploadsService.requestUpload({
      body,
      user,
      correlationId,
    });
  }

  @Get('uploads')
  async listUploads(
    @CurrentUser() user: AuthenticatedUser,
    @Query('userId') userId?: string,
  ) {
    return this.uploadsService.listUploads({
      requester: user,
      userIdFilter: userId,
    });
  }

  @Get('uploads/:fileId/status')
  async getUploadStatus(
    @Param('fileId') fileId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.uploadsService.getUploadStatus({
      fileId,
      requester: user,
    });
  }

  @Roles('admin')
  @Post('admin/uploads/:fileId/reprocess')
  async requestReprocess(
    @Param('fileId') fileId: string,
    @Body() body: ReprocessUploadRequestBody,
    @CurrentUser() user: AuthenticatedUser,
    @Headers('x-correlation-id') correlationId?: string,
  ) {
    return this.uploadsService.requestReprocess({
      fileId,
      body,
      requester: user,
      correlationId,
    });
  }
}
