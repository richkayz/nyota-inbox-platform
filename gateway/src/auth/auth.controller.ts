import { Body, Controller, Post, Req, UseGuards, HttpCode } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { Request } from 'express';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { RefreshDto } from './dto/refresh.dto';
import { CurrentUser, AuthUser } from '../common/decorators/current-user.decorator';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post('login')
  @HttpCode(200)
  login(@Body() dto: LoginDto, @Req() req: Request) {
    return this.auth.login(dto, ipOf(req), req.headers['user-agent']);
  }

  @Post('refresh')
  @HttpCode(200)
  refresh(@Body() dto: RefreshDto, @Req() req: Request) {
    return this.auth.refresh(dto.refreshToken, ipOf(req), req.headers['user-agent']);
  }

  /**
   * On-screen password change for the platform super-admin. No session needed —
   * the current password is the proof of ownership.
   */
  @Post('platform-admin/password')
  @HttpCode(204)
  async changePlatformPassword(@Body() dto: ChangePlatformPasswordDto) {
    await this.auth.changePlatformAdminPassword(dto.email, dto.currentPassword, dto.newPassword);
  }


  @Post('logout')
  @HttpCode(204)
  @ApiBearerAuth()
  @UseGuards(AuthGuard('jwt'))
  async logout(@CurrentUser() user: AuthUser, @Req() req: Request) {
    await this.auth.logout(user.userId, user.sessionId, ipOf(req), req.headers['user-agent']);
  }
}

function ipOf(req: Request): string | undefined {
  const fwd = req.headers['x-forwarded-for'];
  if (typeof fwd === 'string') return fwd.split(',')[0].trim();
  return req.socket.remoteAddress ?? undefined;
}
