import { Module, forwardRef } from '@nestjs/common';
import { ImapPoolService } from './imap-pool.service';
import { ImapIdleService } from './imap-idle.service';
import { SseModule } from '../sse/sse.module';

@Module({
  imports: [forwardRef(() => SseModule)],
  providers: [ImapPoolService, ImapIdleService],
  exports: [ImapPoolService, ImapIdleService],
})
export class ImapModule {}
