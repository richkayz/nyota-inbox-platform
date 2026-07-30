import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ImapFlow } from 'imapflow';
import { SessionStoreService } from '../auth/session-store.service';
import { imapBaseOptions } from './imap-options';

interface PooledConnection {
  client: ImapFlow;
  busy: boolean;
  lastUsedAt: number;
}

interface UserPool {
  connections: PooledConnection[];
  waiters: Array<(c: PooledConnection) => void>;
}

const IDLE_CLOSE_MS = 5 * 60 * 1000;

/**
 * Per-session IMAP connection pool.
 * Uses `imapflow` (maintained, promise-based, IDLE-capable).
 */
@Injectable()
export class ImapPoolService implements OnModuleDestroy {
  private readonly logger = new Logger(ImapPoolService.name);
  private readonly pools = new Map<string, UserPool>();

  constructor(private readonly sessions: SessionStoreService) {
    setInterval(() => this.reap(), 60_000).unref?.();
  }

  /** Quick credential check without keeping a connection open. */
  async verifyCredentials(email: string, password: string): Promise<boolean> {
    const client = this.buildClient(email, password);
    try {
      await client.connect();
      await client.logout();
      return true;
    } catch (err) {
      this.logger.warn(`IMAP auth failed for ${email}: ${(err as Error).message}`);
      return false;
    }
  }

  /** Pre-open a connection for a session so first user action is instant. */
  async warm(sessionId: string): Promise<void> {
    const conn = await this.acquire(sessionId);
    this.release(sessionId, conn);
  }

  /** Borrow a connection. Caller MUST call release() or releaseError(). */
  async acquire(sessionId: string): Promise<PooledConnection> {
    const session = this.sessions.get(sessionId);
    if (!session) throw new Error('No live session');

    const max = Number(process.env.IMAP_POOL_MAX ?? 4);
    let pool = this.pools.get(sessionId);
    if (!pool) {
      pool = { connections: [], waiters: [] };
      this.pools.set(sessionId, pool);
    }

    const free = pool.connections.find((c) => !c.busy);
    if (free) {
      free.busy = true;
      free.lastUsedAt = Date.now();
      return free;
    }

    if (pool.connections.length < max) {
      const password = this.sessions.password(sessionId);
      if (!password) throw new Error('Session lost');
      const client = this.buildClient(session.email, password);
      await client.connect();
      const conn: PooledConnection = { client, busy: true, lastUsedAt: Date.now() };
      pool.connections.push(conn);
      return conn;
    }

    // Wait for a release.
    return new Promise((resolve) => pool!.waiters.push(resolve));
  }

  release(sessionId: string, conn: PooledConnection): void {
    const pool = this.pools.get(sessionId);
    if (!pool) return;
    conn.busy = false;
    conn.lastUsedAt = Date.now();
    const next = pool.waiters.shift();
    if (next) {
      conn.busy = true;
      next(conn);
    }
  }

  async releaseError(sessionId: string, conn: PooledConnection): Promise<void> {
    const pool = this.pools.get(sessionId);
    if (!pool) return;
    pool.connections = pool.connections.filter((c) => c !== conn);
    try {
      await conn.client.logout();
    } catch {
      /* ignore */
    }
  }

  async close(sessionId: string): Promise<void> {
    const pool = this.pools.get(sessionId);
    if (!pool) return;
    for (const c of pool.connections) {
      try {
        await c.client.logout();
      } catch {
        /* ignore */
      }
    }
    this.pools.delete(sessionId);
  }

  async onModuleDestroy() {
    for (const id of Array.from(this.pools.keys())) await this.close(id);
  }

  private buildClient(email: string, password: string): ImapFlow {
    return new ImapFlow({
      ...imapBaseOptions(),
      auth: { user: email, pass: password },
      logger: false,
      emitLogs: false,
    });
  }

  private reap(): void {
    const now = Date.now();
    for (const [sid, pool] of this.pools) {
      for (const c of [...pool.connections]) {
        if (!c.busy && now - c.lastUsedAt > IDLE_CLOSE_MS) {
          pool.connections = pool.connections.filter((x) => x !== c);
          c.client.logout().catch(() => undefined);
        }
      }
      if (pool.connections.length === 0 && pool.waiters.length === 0) {
        this.pools.delete(sid);
      }
    }
  }
}
