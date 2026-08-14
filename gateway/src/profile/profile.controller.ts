import { Body, Controller, Get, Patch, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser, AuthUser } from '../common/decorators/current-user.decorator';
import { ProfileService } from './profile.service';

@ApiTags('profile')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'))
@Controller('profile')
export class ProfileController {
  constructor(private readonly svc: ProfileService) {}

  @Get()
  getProfile(@CurrentUser() u: AuthUser) {
    return this.svc.getProfile(u.userId);
  }

  @Patch()
  updateProfile(
    @CurrentUser() u: AuthUser,
    @Body() body: { displayName?: string },
  ) {
    return this.svc.updateProfile(u.userId, body);
  }
}
