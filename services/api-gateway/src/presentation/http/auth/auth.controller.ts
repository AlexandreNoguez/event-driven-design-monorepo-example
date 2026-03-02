import { Body, Controller, Post } from '@nestjs/common';
import { SignInApplicationService } from '../../../application/auth/sign-in.application.service';
import { Public } from './public.decorator';
import type { SignInRequestBody } from './auth.http-types';

@Controller('auth')
export class AuthController {
  constructor(private readonly signInService: SignInApplicationService) {}

  @Public()
  @Post('login')
  async signIn(@Body() body: SignInRequestBody) {
    return this.signInService.signIn({
      username: body?.username,
      password: body?.password,
    });
  }
}
