import { Injectable, Logger } from '@nestjs/common';
import { v4 as uuid } from 'uuid';
import { decryptSecret, encryptSecret } from './crypto.util';

/**
 * In-memory session store keyed by opaque sessionId.
 * Mailbox passwords are held encrypted and never touch disk.
 * A hard TTL and idle-eviction guard against unbounded growth.
 */
export interface SessionRecord {
  sessionId: string;
  userId: string;
  email: string;
  tenantId: string;
  encryptedPassword: string;
  createdAt: number;
  lastSeenAt: number;
}

const HARD_TTL_MS = 1000 * 60 * 60 * 12;   // 12h absolute
const IDLE_TTL_MS = 1000 * 60 * 60 * 2;    // 2h idle

@Injectable()
export class SessionStoreService {
  private readonly logger = new Logger(SessionStoreService.name);
  private readonly store = new Map<string, SessionRecord>();

  constructor() {
    setInterval(() => this.sweep(), 5 * 60 * 1000).unref?.();
  }

  create(input: { userId: string; email: string; tenantId: string; password: string }): SessionRecord {
    const now = Date.now();
    const record: SessionRecord = {
      sessionId: uuid(),
      userId: input.userId,
      email: input.email,
      tenantId: input.tenantId,
      encryptedPassword: encryptSecret(input.password),
      createdAt: now,
      lastSeenAt: now,
    };
    this.store.set(record.sessionId, record);
    return record;
  }

  get(sessionId: string): SessionRecord | null {
    const rec = this.store.get(sessionId);
    if (!rec) return null;
    const now = Date.now();
    if (now - rec.createdAt > HARD_TTL_MS || now - rec.lastSeenAt > IDLE_TTL_MS) {
      this.store.delete(sessionId);
      return null;
    }
    rec.lastSeenAt = now;
    return rec;
  }

  password(sessionId: string): string | null {
    const rec = this.get(sessionId);
    return rec ? decryptSecret(rec.encryptedPassword) : null;
  }

  destroy(sessionId: string): void {
    this.store.delete(sessionId);
  }

  private sweep(): void {
    const now = Date.now();
    let removed = 0;
    for (const [id, rec] of this.store) {
      if (now - rec.createdAt > HARD_TTL_MS || now - rec.lastSeenAt > IDLE_TTL_MS) {
        this.store.delete(id);
        removed++;
      }
    }
    if (removed > 0) this.logger.debug(`Swept ${removed} idle sessions`);
  }
}
