import { Body, Controller, Delete, Get, Param, ParseIntPipe, Patch, Post, Query, Res, UseGuards } from '@nestjs/common';
import type { Response } from 'express';
import { AuthGuard } from '@nestjs/passport';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser, AuthUser } from '../common/decorators/current-user.decorator';
import { MailService } from './mail.service';
import { ListMessagesDto } from './dto/list-messages.dto';
import { SendMessageDto } from './dto/send-message.dto';
import { ImapIdleService } from '../imap/imap-idle.service';

@ApiTags('mail')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'))
@Controller('mail')
export class MailController {
  constructor(private readonly mail: MailService, private readonly idle: ImapIdleService) {}

  @Get('folders')
  async folders(@CurrentUser() user: AuthUser) {
    return this.mail.listFolders(user.sessionId, user.userId);
  }

  @Get('messages')
  async messages(@CurrentUser() user: AuthUser, @Query() dto: ListMessagesDto) {
    // Kick off IDLE watcher lazily on first inbox open.
    this.idle.ensure(user.sessionId, dto.folder).catch(() => undefined);
    return this.mail.listMessages(user.sessionId, dto.folder, dto.limit ?? 50, dto.cursor ?? null, dto.q);
  }

  @Get('messages/:folder/:uid')
  async getMessage(
    @CurrentUser() user: AuthUser,
    @Param('folder') folder: string,
    @Param('uid', ParseIntPipe) uid: number,
  ) {
    return this.mail.getMessage(user.sessionId, folder, uid);
  }

  @Get('messages/:folder/:uid/attachments/:part')
  async attachment(
    @CurrentUser() user: AuthUser,
    @Param('folder') folder: string,
    @Param('uid', ParseIntPipe) uid: number,
    @Param('part') part: string,
    @Res() res: Response,
  ) {
    const file = await this.mail.downloadAttachment(user.sessionId, folder, uid, part);
    res.setHeader('Content-Type', file.contentType);
    res.setHeader('Content-Length', String(file.content.length));
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${file.filename.replace(/[^\w.\- ]+/g, '_')}"`,
    );
    res.end(file.content);
  }

  @Patch('messages/:folder/:uid/flags')
  async flags(
    @CurrentUser() user: AuthUser,
    @Param('folder') folder: string,
    @Param('uid', ParseIntPipe) uid: number,
    @Body() body: { add?: string[]; remove?: string[] },
  ) {
    await this.mail.setFlags(user.sessionId, folder, uid, body.add ?? [], body.remove ?? []);
    return { ok: true };
  }

  @Patch('messages/:folder/:uid/move')
  async move(
    @CurrentUser() user: AuthUser,
    @Param('folder') folder: string,
    @Param('uid', ParseIntPipe) uid: number,
    @Body() body: { target: string },
  ) {
    await this.mail.move(user.sessionId, folder, uid, body.target);
    return { ok: true };
  }

  @Delete('messages/:folder/:uid')
  async remove(
    @CurrentUser() user: AuthUser,
    @Param('folder') folder: string,
    @Param('uid', ParseIntPipe) uid: number,
  ) {
    await this.mail.remove(user.sessionId, folder, uid);
    return { ok: true };
  }

  @Post('send')
  async send(@CurrentUser() user: AuthUser, @Body() dto: SendMessageDto) {
    return this.mail.send(user.sessionId, { ...dto, from: user.email });
  }
}
