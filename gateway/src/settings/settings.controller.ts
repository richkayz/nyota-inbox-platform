import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser, AuthUser } from '../common/decorators/current-user.decorator';
import { SettingsService } from './settings.service';

@ApiTags('settings')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'))
@Controller('settings')
export class SettingsController {
  constructor(private readonly svc: SettingsService) {}

  @Get('preferences')
  prefs(@CurrentUser() u: AuthUser) { return this.svc.getPreferences(u.userId); }

  @Patch('preferences')
  updatePrefs(@CurrentUser() u: AuthUser, @Body() body: any) { return this.svc.updatePreferences(u.userId, body); }

  @Get('notifications')
  notifs(@CurrentUser() u: AuthUser) { return this.svc.getNotifications(u.userId); }

  @Patch('notifications')
  updateNotifs(@CurrentUser() u: AuthUser, @Body() body: any) { return this.svc.updateNotifications(u.userId, body); }

  @Get('signatures')
  sigs(@CurrentUser() u: AuthUser) { return this.svc.listSignatures(u.userId); }

  @Post('signatures')
  upsertSig(@CurrentUser() u: AuthUser, @Body() body: any) { return this.svc.upsertSignature(u.userId, body); }

  @Delete('signatures/:id')
  removeSig(@CurrentUser() u: AuthUser, @Param('id') id: string) { return this.svc.removeSignature(u.userId, id); }
}
