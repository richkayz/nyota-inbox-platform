import { Controller, Get, Param, ParseIntPipe, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { PleskService } from './plesk.service';

@ApiTags('plesk')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'))
@Controller('plesk')
export class PleskController {
  constructor(private readonly plesk: PleskService) {}

  @Get('server')
  getServer() {
    return this.plesk.getServer();
  }

  @Get('domains')
  listDomains() {
    return this.plesk.listDomains();
  }

  @Get('domains/:id')
  getDomain(@Param('id', ParseIntPipe) id: number) {
    return this.plesk.getDomain(id);
  }

  @Get('domains/:id/mailboxes')
  listMailboxes(@Param('id', ParseIntPipe) id: number) {
    return this.plesk.listMailboxes(id);
  }
}
