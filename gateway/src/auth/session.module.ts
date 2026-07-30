import { Global, Module } from '@nestjs/common';
import { SessionStoreService } from './session-store.service';

/**
 * The encrypted in-memory mailbox-session store is a process-wide singleton:
 * IMAP, SMTP, auth, and health all resolve credentials from it. Exposing it as
 * a @Global module avoids circular imports between AuthModule and ImapModule.
 */
@Global()
@Module({
  providers: [SessionStoreService],
  exports: [SessionStoreService],
})
export class SessionModule {}
