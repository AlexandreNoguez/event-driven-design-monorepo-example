import { createParamDecorator, ExecutionContext, UnauthorizedException } from '@nestjs/common';
import type { RequestWithUser } from './request-with-user';

export const CurrentUser = createParamDecorator((_data: unknown, context: ExecutionContext) => {
  const request = context.switchToHttp().getRequest<RequestWithUser>();

  if (!request.user) {
    throw new UnauthorizedException('Authenticated user not found in request context.');
  }

  return request.user;
});
