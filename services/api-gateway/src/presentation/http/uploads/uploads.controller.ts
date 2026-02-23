import {
  Body,
  Controller,
  Get,
  Headers,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import { UploadsApplicationService } from '../../../application/uploads/uploads.application.service';
import type { AuthenticatedUser } from '../../../domain/auth/authenticated-user';
import { CurrentUser } from '../auth/current-user.decorator';
import { Roles } from '../auth/roles.decorator';
import type { CreateUploadRequestBody, ReprocessUploadRequestBody } from './uploads.http-types';

@Controller()
export class UploadsController {
  constructor(private readonly uploadsService: UploadsApplicationService) {}

  @Post('uploads')
  async createUpload(
    @Body() body: CreateUploadRequestBody,
    @CurrentUser() user: AuthenticatedUser,
    @Headers('x-correlation-id') correlationId?: string,
  ) {
    return this.uploadsService.requestUpload({
      fileId: body?.fileId,
      fileName: body?.fileName,
      contentType: body?.contentType,
      sizeBytes: body?.sizeBytes,
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
      reason: body?.reason,
      requester: user,
      correlationId,
    });
  }
}
