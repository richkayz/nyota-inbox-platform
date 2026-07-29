import { Injectable, Logger, OnModuleDestroy, Inject, forwardRef } from '@nestjs/common';
import { ImapFlow } from 'imapflow';
import { SessionStoreService } from '../auth/session-store.service';
import { SseService } from '../sse/sse.service';

interface Watcher {
  client: ImapFlow;
  folder: string;
  stopped: boolean;
}

/**
 * Maintains one dedicated IMAP IDLE connection per (session, folder=INBOX).
 * Fans out `exists`, `expunge`, and `flags` events over SSE.
 */
@Injectable()
export class ImapIdleService implements OnModuleDestroy {
  private readonly logger = new Logger(ImapIdleService.name);
  private readonly watchers = new Map<string, Watcher>();

  constructor(
    private readonly sessions: SessionStoreService,
    @Inject(forwardRef(() => SseService)) private readonly sse: SseService,
  ) {}

  async ensure(sessionId: string, folder = 'INBOX'): Promise<void> {
    const key = `${sessionId}:${folder}`;
    if (this.watchers.has(key)) return;

    const session = this.sessions.get(sessionId);
    if (!session) return;
    const password = this.sessions.password(sessionId);
    if (!password) return;

    const client = new ImapFlow({
      host: process.env.IMAP_HOST ?? '127.0.0.1',
      port: Number(process.env.IMAP_PORT ?? 993),
      secure: (process.env.IMAP_SECURE ?? 'true') === 'true',
      auth: { user: session.email, pass: password },
      logger: false,
      emitLogs: false,
    });

    const watcher: Watcher = { client, folder, stopped: false };

    client.on('exists', (data) => {
      this.sse.publish(sessionId, { type: 'mail.new', folder, count: (data as any)?.count });
    });
    client.on('expunge', (data) => {
      this.sse.publish(sessionId, { type: 'mail.expunge', folder, seq: (data as any)?.seq });
    });
    client.on('flags', (data) => {
      this.sse.publish(sessionId, { type: 'mail.flags', folder, seq: (data as any)?.seq, flags: (data as any)?.flags });
    });
    client.on('close', () => {
      if (!watcher.stopped) {
        this.logger.warn(`IDLE closed for ${session.email}/${folder}; reconnecting in 5s`);
        setTimeout(() => {
          this.watchers.delete(key);
          this.ensure(sessionId, folder).catch(() => undefined);
        }, 5000);
      }
    });

    try {
      await client.connect();
      await client.mailboxOpen(folder);
      this.watchers.set(key, watcher);
      // imapflow enters IDLE automatically after mailboxOpen when idle events are listened to;
      // explicitly call idle() to guarantee it.
      client.idle().catch((e) => this.logger.warn(`idle() error: ${e?.message}`));
      this.logger.log(`IDLE watching ${session.email}/${folder}`);
    } catch (err) {
      this.logger.warn(`Failed to start IDLE for ${session.email}: ${(err as Error).message}`);
    }
  }

  async stopAll(sessionId: string): Promise<void> {
    for (const [key, w] of this.watchers) {
      if (!key.startsWith(`${sessionId}:`)) continue;
      w.stopped = true;
      try {
        await w.client.logout();
      } catch {
        /* ignore */
      }
      this.watchers.delete(key);
    }
  }

  async onModuleDestroy() {
    for (const [, w] of this.watchers) {
      w.stopped = true;
      try {
        await w.client.logout();
      } catch {
        /* ignore */
      }
    }
    this.watchers.clear();
  }
}
