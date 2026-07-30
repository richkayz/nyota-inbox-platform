import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ImapPoolService } from '../imap/imap-pool.service';
import { SmtpService, OutgoingMessage } from '../smtp/smtp.service';
import { PrismaService } from '../prisma/prisma.service';

export interface FolderSummary {
  path: string;
  name: string;
  delimiter: string;
  role: string | null;
  totalCount: number;
  unreadCount: number;
}

export interface MessageListItem {
  uid: number;
  folder: string;
  from: { name?: string; address: string };
  to: Array<{ name?: string; address: string }>;
  subject: string;
  preview: string;
  date: string;
  unread: boolean;
  starred: boolean;
  hasAttachment: boolean;
  threadId?: string;
}

export interface MessageDetail extends MessageListItem {
  bodyText?: string;
  bodyHtml?: string;
  headers: Record<string, string>;
  attachments: Array<{ id: string; filename: string; contentType: string; size: number }>;
}

export interface Page<T> {
  items: T[];
  nextCursor: string | null;
}

const ROLE_MAP: Record<string, string> = {
  '\\Inbox': 'inbox',
  '\\Sent': 'sent',
  '\\Drafts': 'drafts',
  '\\Junk': 'spam',
  '\\Trash': 'trash',
  '\\Archive': 'archive',
  '\\All': 'archive',
};

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);

  constructor(
    private readonly pool: ImapPoolService,
    private readonly smtp: SmtpService,
    private readonly prisma: PrismaService,
  ) {}

  async listFolders(sessionId: string, userId: string): Promise<FolderSummary[]> {
    const conn = await this.pool.acquire(sessionId);
    try {
      const list = await conn.client.list();
      const out: FolderSummary[] = [];
      for (const folder of list) {
        const status = await conn.client
          .status(folder.path, { messages: true, unseen: true, uidValidity: true })
          .catch(() => null);
        const role =
          (folder.specialUse && ROLE_MAP[folder.specialUse]) ||
          (folder.path.toUpperCase() === 'INBOX' ? 'inbox' : null);
        const summary: FolderSummary = {
          path: folder.path,
          name: folder.name,
          delimiter: folder.delimiter ?? '/',
          role,
          totalCount: status?.messages ?? 0,
          unreadCount: status?.unseen ?? 0,
        };
        out.push(summary);
        await this.prisma.folderCache
          .upsert({
            where: { userId_path: { userId, path: folder.path } },
            update: {
              name: folder.name,
              role: role ?? undefined,
              delimiter: folder.delimiter ?? '/',
              totalCount: summary.totalCount,
              unreadCount: summary.unreadCount,
              uidValidity: status?.uidValidity ? BigInt(status.uidValidity) : undefined,
              lastSyncedAt: new Date(),
            },
            create: {
              userId,
              path: folder.path,
              name: folder.name,
              role,
              delimiter: folder.delimiter ?? '/',
              totalCount: summary.totalCount,
              unreadCount: summary.unreadCount,
              uidValidity: status?.uidValidity ? BigInt(status.uidValidity) : undefined,
            },
          })
          .catch(() => undefined);
      }
      return out;
    } finally {
      this.pool.release(sessionId, conn);
    }
  }

  /**
   * Cursor-based listing. Cursor encodes `${uidValidity}:${nextUid}`.
   * Newest → oldest, Gmail-style. `nextCursor = null` when the folder is
   * fully paged.
   */
  async listMessages(
    sessionId: string,
    folder: string,
    limit: number,
    cursor: string | null,
    q?: string,
  ): Promise<Page<MessageListItem>> {
    const conn = await this.pool.acquire(sessionId);
    try {
      const mailbox = await conn.client.mailboxOpen(folder, { readOnly: true });
      const validity = String(mailbox.uidValidity);

      let uidRange: string;
      let matchedUids: number[] | null = null;

      if (q) {
        const results = (await conn.client.search({ text: q }, { uid: true })) as number[] | false;
        matchedUids = Array.isArray(results)
          ? [...results].sort((a: number, b: number) => b - a)
          : [];
      }

      let startUid: number;
      if (cursor) {
        const [cv, cUid] = cursor.split(':');
        if (cv !== validity) {
          // UIDVALIDITY changed — restart from newest.
          startUid = mailbox.exists;
        } else {
          startUid = Math.max(1, Number(cUid));
        }
      } else {
        startUid = mailbox.exists;
      }

      if (matchedUids) {
        const slice = matchedUids.filter((u) => u <= startUid).slice(0, limit);
        if (slice.length === 0) return { items: [], nextCursor: null };
        uidRange = slice.join(',');
        const items = await this.fetchEnvelopes(conn.client, folder, uidRange);
        const last = slice[slice.length - 1];
        const remaining = matchedUids.filter((u) => u < last);
        return { items, nextCursor: remaining.length > 0 ? `${validity}:${last - 1}` : null };
      }

      const from = Math.max(1, startUid - limit + 1);
      uidRange = `${from}:${startUid}`;
      const items = await this.fetchEnvelopes(conn.client, folder, uidRange);
      const nextCursor = from > 1 ? `${validity}:${from - 1}` : null;
      return { items, nextCursor };
    } finally {
      this.pool.release(sessionId, conn);
    }
  }

  async getMessage(sessionId: string, folder: string, uid: number): Promise<MessageDetail> {
    const conn = await this.pool.acquire(sessionId);
    try {
      await conn.client.mailboxOpen(folder, { readOnly: true });
      const msg = await conn.client.fetchOne(
        String(uid),
        { uid: true, envelope: true, flags: true, bodyStructure: true, source: true, headers: true },
        { uid: true },
      );
      if (!msg) throw new NotFoundException('Message not found');

      const parsed = await this.parseSource(msg.source as Buffer);
      return {
        uid: Number(msg.uid),
        folder,
        from: this.addr(msg.envelope?.from?.[0]),
        to: (msg.envelope?.to ?? []).map((a) => this.addr(a)),
        subject: msg.envelope?.subject ?? '',
        preview: (parsed.text ?? '').slice(0, 200),
        date: msg.envelope?.date?.toISOString() ?? new Date().toISOString(),
        unread: !msg.flags?.has('\\Seen'),
        starred: !!msg.flags?.has('\\Flagged'),
        hasAttachment: parsed.attachments.length > 0,
        bodyText: parsed.text,
        bodyHtml: parsed.html,
        headers: parsed.headers,
        attachments: parsed.attachments,
      };
    } finally {
      this.pool.release(sessionId, conn);
    }
  }

  async setFlags(
    sessionId: string,
    folder: string,
    uid: number,
    add: string[],
    remove: string[],
  ): Promise<void> {
    const conn = await this.pool.acquire(sessionId);
    try {
      await conn.client.mailboxOpen(folder);
      if (add.length) await conn.client.messageFlagsAdd({ uid: String(uid) }, add, { uid: true });
      if (remove.length) await conn.client.messageFlagsRemove({ uid: String(uid) }, remove, { uid: true });
    } finally {
      this.pool.release(sessionId, conn);
    }
  }

  async move(sessionId: string, folder: string, uid: number, target: string): Promise<void> {
    const conn = await this.pool.acquire(sessionId);
    try {
      await conn.client.mailboxOpen(folder);
      await conn.client.messageMove({ uid: String(uid) }, target, { uid: true });
    } finally {
      this.pool.release(sessionId, conn);
    }
  }

  async remove(sessionId: string, folder: string, uid: number): Promise<void> {
    const conn = await this.pool.acquire(sessionId);
    try {
      await conn.client.mailboxOpen(folder);
      await conn.client.messageDelete({ uid: String(uid) }, { uid: true });
    } finally {
      this.pool.release(sessionId, conn);
    }
  }

  async send(sessionId: string, msg: OutgoingMessage, appendToSent = true): Promise<{ messageId: string }> {
    const res = await this.smtp.send(sessionId, msg);
    if (appendToSent) {
      // Best-effort: append the sent copy so IMAP is the source of truth.
      const conn = await this.pool.acquire(sessionId).catch(() => null);
      if (conn) {
        try {
          const raw = this.buildRfc822(msg, res.messageId);
          await conn.client.append('Sent', raw, ['\\Seen']);
        } catch (e) {
          this.logger.warn(`Append-to-Sent failed: ${(e as Error).message}`);
        } finally {
          this.pool.release(sessionId, conn);
        }
      }
    }
    return res;
  }

  private async fetchEnvelopes(client: any, folder: string, uidRange: string): Promise<MessageListItem[]> {
    const out: MessageListItem[] = [];
    for await (const msg of client.fetch(uidRange, { uid: true, envelope: true, flags: true, bodyStructure: true }, { uid: true })) {
      out.push({
        uid: Number(msg.uid),
        folder,
        from: this.addr(msg.envelope?.from?.[0]),
        to: (msg.envelope?.to ?? []).map((a: any) => this.addr(a)),
        subject: msg.envelope?.subject ?? '',
        preview: '',
        date: msg.envelope?.date?.toISOString() ?? new Date().toISOString(),
        unread: !msg.flags?.has('\\Seen'),
        starred: !!msg.flags?.has('\\Flagged'),
        hasAttachment: this.structureHasAttachment(msg.bodyStructure),
      });
    }
    return out.sort((a, b) => b.uid - a.uid);
  }

  private structureHasAttachment(part: any): boolean {
    if (!part) return false;
    if (part.disposition === 'attachment') return true;
    if (Array.isArray(part.childNodes)) return part.childNodes.some((c: any) => this.structureHasAttachment(c));
    return false;
  }

  private addr(a: any): { name?: string; address: string } {
    if (!a) return { address: '' };
    return { name: a.name || undefined, address: `${a.mailbox ?? ''}@${a.host ?? ''}` };
  }

  private async parseSource(_source: Buffer): Promise<{
    text?: string;
    html?: string;
    headers: Record<string, string>;
    attachments: Array<{ id: string; filename: string; contentType: string; size: number }>;
  }> {
    // NOTE: production build depends on `mailparser`. Kept as a stub here to
    // keep the module tree light for scaffolding; wire `simpleParser` from
    // `mailparser` in the real deployment to populate this fully.
    return { headers: {}, attachments: [] };
  }

  private buildRfc822(msg: OutgoingMessage, messageId: string): string {
    const lines: string[] = [
      `Message-ID: ${messageId}`,
      `From: ${msg.from}`,
      `To: ${msg.to.join(', ')}`,
      msg.cc?.length ? `Cc: ${msg.cc.join(', ')}` : '',
      `Subject: ${msg.subject}`,
      `Date: ${new Date().toUTCString()}`,
      `MIME-Version: 1.0`,
      msg.html ? `Content-Type: text/html; charset=utf-8` : `Content-Type: text/plain; charset=utf-8`,
      '',
      msg.html ?? msg.text ?? '',
    ].filter(Boolean);
    return lines.join('\r\n');
  }
}
