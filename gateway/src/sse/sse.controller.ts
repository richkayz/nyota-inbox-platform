import { Controller, Sse, UseGuards, MessageEvent } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Observable, merge, interval, map } from 'rxjs';
import { CurrentUser, AuthUser } from '../common/decorators/current-user.decorator';
import { SseService } from './sse.service';

@ApiTags('sse')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'))
@Controller('events')
export class SseController {
  constructor(private readonly sse: SseService) {}

  @Sse()
  stream(@CurrentUser() user: AuthUser): Observable<MessageEvent> {
    const events = this.sse.stream(user.sessionId).pipe(
      map((e) => ({ data: e.data } as MessageEvent)),
    );
    // Heartbeat every 20s so proxies keep the connection open.
    const heartbeat = interval(20_000).pipe(
      map(() => ({ data: { type: 'ping', at: Date.now() } } as MessageEvent)),
    );
    return merge(events, heartbeat);
  }
}
