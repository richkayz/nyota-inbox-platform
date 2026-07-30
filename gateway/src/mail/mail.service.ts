import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { simpleParser, type ParsedMail } from 'mailparser';
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

export interface MessageAddress {
  name?: string;
  address: string;
}

export interface AttachmentMeta {
  /** IMAP body part number — used by the download endpoint. */
  id: string;
  filename: string;
  contentType: string;
  size: number;
  contentId?: string;
  inline?: boolean;
}

export interface MessageListItem {
  uid: number;
  folder: string;
  from: MessageAddress;
  to: MessageAddress[];
  subject: string;
  /** First ~250 chars of the plain-text body. */
  preview: string;
  snippet: string;
  date: string;
  unread: boolean;
  starred: boolean;
  hasAttachment: boolean;
  threadId?: string;
}

export interface MessageDetail extends MessageListItem {
  cc: MessageAddress[];
  bcc: MessageAddress[];
  replyTo: MessageAddress[];
  bodyText?: string;
  bodyHtml?: string;
  /** Aliases matching the documented gateway contract. */
  text?: string;
  html?: string;
  headers: Record<string, string>;
  attachments: AttachmentMeta[];
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

/** Body parts we speculatively fetch for list snippets. Dovecot returns NIL for
 * parts that do not exist, so over-asking is safe and keeps listing to one
 * round trip per page. */
const SNIPPET_PARTS = ['1', '1.1', '1.2', '2', '2.1'];

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
        matchedUids = await this.searchUids(conn.client, q);
      }

      // Highest existing UID — NOT `exists` (message count). They only
      // coincide in a mailbox that has never had a deletion (typically INBOX);
      // in Sent they diverge, which silently paged the wrong UID window.
      const highestUid = Math.max(
        1,
        Number(mailbox.uidNext ?? 0) - 1 || Number(mailbox.exists ?? 1),
      );

      let startUid: number;
      if (cursor) {
        const [cv, cUid] = cursor.split(':');
        if (cv !== validity) {
          // UIDVALIDITY changed — restart from newest.
          startUid = highestUid;
        } else {
          startUid = Math.max(1, Number(cUid));
        }
      } else {
        startUid = highestUid;
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

  /**
   * Server-side search across subject, from, to/cc, body text and attachment
   * filenames. IMAP `TEXT` covers headers + body; the filename term is OR-ed in
   * for servers that index Content-Disposition parameters.
   */
  private async searchUids(client: any, q: string): Promise<number[]> {
    const term = q.trim();
    const queries: any[] = [
      { or: [{ text: term }, { header: { 'content-disposition': term } }] },
      { text: term },
      {
        or: [
          { subject: term },
          { from: term },
          { to: term },
          { cc: term },
          { body: term },
        ],
      },
    ];
    for (const query of queries) {
      try {
        const res = (await client.search(query, { uid: true })) as number[] | false;
        if (Array.isArray(res)) return [...res].sort((a, b) => b - a);
      } catch {
        /* try the next, simpler form */
      }
    }
    return [];
  }

  async getMessage(sessionId: string, folder: string, uid: number): Promise<MessageDetail> {
    const conn = await this.pool.acquire(sessionId);
    try {
      await conn.client.mailboxOpen(folder, { readOnly: true });
      const msg = await conn.client.fetchOne(
        String(uid),
        { uid: true, envelope: true, flags: true, bodyStructure: true, source: true },
        { uid: true },
      );
      if (!msg) throw new NotFoundException('Message not found');

      const parsed = await this.parseSource(msg.source as Buffer);
      const structureAttachments = this.collectAttachments(msg.bodyStructure);
      const attachments = this.mergeAttachments(structureAttachments, parsed);
      let text = parsed.text?.trim() ? parsed.text : undefined;
      let html = parsed.html?.trim() ? parsed.html : undefined;

      // Fallback: some servers/clients (notably Sent copies appended by other
      // MUAs) produce sources mailparser can't fully decode. Pull the text
      // parts straight off IMAP so the reading pane is never blank.
      if (!text && !html) {
        const candidates = this.textPartNumbers(msg.bodyStructure);
        for (const candidate of candidates.slice(0, 4)) {
          const raw = await this.downloadPartAsText(conn.client, Number(msg.uid), candidate.part);
          if (!raw?.trim()) continue;
          if (candidate.type === 'text/html') html = raw;
          else text = raw;
          if (html || text) break;
        }
        if (!text && !html) {
          const raw = (msg.source as Buffer)?.toString('utf8') ?? '';
          const idx = raw.indexOf('\r\n\r\n');
          const body = idx >= 0 ? raw.slice(idx + 4) : '';
          if (body.trim()) {
            if (/<\/?(html|body|div|p|table|br)/i.test(body)) html = body;
            else text = body;
          }
        }
      }

      const snippet = this.buildSnippet(text, html);


      return {
        uid: Number(msg.uid),
        folder,
        from: this.addr(msg.envelope?.from?.[0]),
        to: (msg.envelope?.to ?? []).map((a) => this.addr(a)),
        cc: (msg.envelope?.cc ?? []).map((a) => this.addr(a)),
        bcc: (msg.envelope?.bcc ?? []).map((a) => this.addr(a)),
        replyTo: (msg.envelope?.replyTo ?? []).map((a) => this.addr(a)),
        subject: msg.envelope?.subject ?? parsed.subject ?? '',
        preview: snippet,
        snippet,
        date: (msg.envelope?.date ?? parsed.date ?? new Date()).toISOString(),
        unread: !msg.flags?.has('\\Seen'),
        starred: !!msg.flags?.has('\\Flagged'),
        hasAttachment: attachments.some((a) => !a.inline),
        bodyText: text,
        bodyHtml: html,
        text,
        html,
        headers: parsed.headers,
        attachments,
      };
    } finally {
      this.pool.release(sessionId, conn);
    }
  }

  /** Streams a single attachment (by IMAP body part) back to the caller. */
  async downloadAttachment(
    sessionId: string,
    folder: string,
    uid: number,
    part: string,
  ): Promise<{ content: Buffer; filename: string; contentType: string }> {
    const conn = await this.pool.acquire(sessionId);
    try {
      await conn.client.mailboxOpen(folder, { readOnly: true });
      const dl = await conn.client.download(String(uid), part, { uid: true });
      if (!dl?.content) throw new NotFoundException('Attachment not found');
      const chunks: Buffer[] = [];
      for await (const chunk of dl.content as AsyncIterable<Buffer>) chunks.push(Buffer.from(chunk));
      return {
        content: Buffer.concat(chunks),
        filename: (dl.meta?.filename as string) || `attachment-${part}`,
        contentType: (dl.meta?.contentType as string) || 'application/octet-stream',
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
    const needsBackfill: Array<{ item: MessageListItem; structure: any }> = [];
    for await (const msg of client.fetch(
      uidRange,
      { uid: true, envelope: true, flags: true, bodyStructure: true, bodyParts: SNIPPET_PARTS },
      { uid: true },
    )) {
      const snippet = this.snippetFromParts(msg.bodyStructure, msg.bodyParts);
      const item: MessageListItem = {
        uid: Number(msg.uid),
        folder,
        from: this.addr(msg.envelope?.from?.[0]),
        to: (msg.envelope?.to ?? []).map((a: any) => this.addr(a)),
        subject: msg.envelope?.subject ?? '',
        preview: snippet,
        snippet,
        date: msg.envelope?.date?.toISOString() ?? new Date().toISOString(),
        unread: !msg.flags?.has('\\Seen'),
        starred: !!msg.flags?.has('\\Flagged'),
        hasAttachment: this.collectAttachments(msg.bodyStructure).some((a) => !a.inline),
      };
      out.push(item);
      if (!snippet) needsBackfill.push({ item, structure: msg.bodyStructure });
    }

    // Speculative part numbers (1, 1.1, 2 …) miss non-standard MIME layouts —
    // very common in Sent copies written by other clients. Download the real
    // text part for those rows so previews are never blank.
    for (const { item, structure } of needsBackfill) {
      const snippet = await this.snippetByDownload(client, item.uid, structure);
      if (snippet) {
        item.snippet = snippet;
        item.preview = snippet;
      }
    }

    return out.sort((a, b) => b.uid - a.uid);
  }

  /** Downloads the best text part for one message and renders a preview. */
  private async snippetByDownload(client: any, uid: number, structure: any): Promise<string> {
    const candidates = this.textPartNumbers(structure);
    const ordered = [
      ...candidates.filter((c) => c.type === 'text/plain'),
      ...candidates.filter((c) => c.type === 'text/html'),
    ];
    for (const candidate of ordered.slice(0, 3)) {
      const raw = await this.downloadPartAsText(client, uid, candidate.part);
      if (!raw) continue;
      const flat = candidate.type === 'text/html' ? this.htmlToText(raw) : raw;
      const clean = this.normalizeSnippet(flat);
      if (clean) return clean;
    }
    return '';
  }

  private async downloadPartAsText(client: any, uid: number, part: string): Promise<string> {
    try {
      const dl = await client.download(String(uid), part, { uid: true });
      if (!dl?.content) return '';
      const chunks: Buffer[] = [];
      for await (const chunk of dl.content as AsyncIterable<Buffer>) {
        chunks.push(Buffer.from(chunk));
        if (chunks.reduce((n, c) => n + c.length, 0) > 256 * 1024) break;
      }
      return Buffer.concat(chunks).toString('utf8');
    } catch {
      return '';
    }
  }


  /**
   * Picks the best textual body part from the speculative snippet fetch and
   * renders it down to a plain, single-line preview.
   */
  private snippetFromParts(structure: any, parts: Map<string, Buffer> | undefined): string {
    if (!parts || parts.size === 0) return '';
    const candidates = this.textPartNumbers(structure);
    const ordered = [
      ...candidates.filter((c) => c.type === 'text/plain').map((c) => c.part),
      ...candidates.filter((c) => c.type === 'text/html').map((c) => c.part),
      ...SNIPPET_PARTS,
    ];
    for (const part of ordered) {
      const buf = parts.get(part) ?? parts.get(part.toUpperCase());
      if (!buf || buf.length === 0) continue;
      const raw = buf.toString('utf8');
      const isHtml = /<[a-z!/]/i.test(raw) && /<\/?(html|body|div|p|table|br)/i.test(raw);
      const flat = isHtml ? this.htmlToText(raw) : raw;
      const clean = this.normalizeSnippet(flat);
      if (clean) return clean;
    }
    return '';
  }

  private textPartNumbers(part: any, prefix = ''): Array<{ part: string; type: string }> {
    if (!part) return [];
    const type = String(part.type ?? '').toLowerCase();
    const number: string = part.part ?? prefix ?? '1';
    if (Array.isArray(part.childNodes) && part.childNodes.length > 0) {
      return part.childNodes.flatMap((c: any) => this.textPartNumbers(c, c.part ?? number));
    }
    if (type === 'text/plain' || type === 'text/html') {
      const disposition = String(part.disposition ?? '').toLowerCase();
      if (disposition === 'attachment') return [];
      return [{ part: number || '1', type }];
    }
    return [];
  }

  private buildSnippet(text?: string, html?: string): string {
    if (text) return this.normalizeSnippet(text);
    if (html) return this.normalizeSnippet(this.htmlToText(html));
    return '';
  }

  private normalizeSnippet(input: string): string {
    return input
      .replace(/\r/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 250);
  }

  private htmlToText(html: string): string {
    return html
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<head[\s\S]*?<\/head>/gi, ' ')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/(p|div|tr|li|h[1-6])>/gi, '\n')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/gi, ' ')
      .replace(/&amp;/gi, '&')
      .replace(/&lt;/gi, '<')
      .replace(/&gt;/gi, '>')
      .replace(/&quot;/gi, '"')
      .replace(/&#39;/gi, "'");
  }

  /** Walks the BODYSTRUCTURE and returns every non-textual / dispositioned part. */
  private collectAttachments(part: any): AttachmentMeta[] {
    if (!part) return [];
    const out: AttachmentMeta[] = [];
    const walk = (node: any) => {
      if (!node) return;
      if (Array.isArray(node.childNodes) && node.childNodes.length > 0) {
        node.childNodes.forEach(walk);
        return;
      }
      const type = String(node.type ?? '').toLowerCase();
      const disposition = String(node.disposition ?? '').toLowerCase();
      const filename =
        node.dispositionParameters?.filename ||
        node.parameters?.name ||
        (node.id ? `inline-${String(node.id).replace(/[<>]/g, '')}` : '');
      const isText = type === 'text/plain' || type === 'text/html';
      const isAttachment = disposition === 'attachment' || (!!filename && !isText) || disposition === 'inline';
      if (!isAttachment) return;
      if (isText && disposition !== 'attachment') return;
      out.push({
        id: node.part ?? '1',
        filename: filename || `part-${node.part ?? '1'}`,
        contentType: type || 'application/octet-stream',
        size: Number(node.size ?? 0),
        contentId: node.id ? String(node.id).replace(/[<>]/g, '') : undefined,
        inline: disposition === 'inline' || (!!node.id && disposition !== 'attachment'),
      });
    };
    walk(part);
    return out;
  }

  /** Prefers mailparser's decoded sizes/filenames where they line up by contentId. */
  private mergeAttachments(structure: AttachmentMeta[], parsed: ParsedResult): AttachmentMeta[] {
    if (structure.length === 0) return parsed.attachments;
    return structure.map((s) => {
      const match = parsed.attachments.find(
        (p) => (s.contentId && p.contentId === s.contentId) || p.filename === s.filename,
      );
      return match ? { ...s, filename: match.filename || s.filename, size: match.size || s.size } : s;
    });
  }

  private addr(a: any): MessageAddress {
    if (!a) return { address: '' };
    if (typeof a.address === 'string' && a.address) {
      return { name: a.name || undefined, address: a.address };
    }
    return { name: a.name || undefined, address: `${a.mailbox ?? ''}@${a.host ?? ''}` };
  }

  /**
   * Full MIME parse via mailparser. Inline (cid:) images are rewritten to data
   * URIs so the UI can render embedded images without extra round trips.
   */
  private async parseSource(source: Buffer): Promise<ParsedResult> {
    const empty: ParsedResult = { headers: {}, attachments: [] };
    if (!source || source.length === 0) return empty;
    let parsed: ParsedMail;
    try {
      parsed = await simpleParser(source, { skipImageLinks: false });
    } catch (e) {
      this.logger.warn(`MIME parse failed: ${(e as Error).message}`);
      return empty;
    }

    const headers: Record<string, string> = {};
    parsed.headerLines?.forEach((h) => {
      const idx = h.line.indexOf(':');
      if (idx > 0) headers[h.key] = h.line.slice(idx + 1).trim();
    });

    const attachments: AttachmentMeta[] = (parsed.attachments ?? []).map((a, i) => ({
      id: String(i + 1),
      filename: a.filename || `attachment-${i + 1}`,
      contentType: a.contentType || 'application/octet-stream',
      size: Number(a.size ?? a.content?.length ?? 0),
      contentId: a.cid || undefined,
      inline: a.contentDisposition === 'inline' || !!a.cid,
    }));

    let html = typeof parsed.html === 'string' ? parsed.html : undefined;
    if (html) html = this.inlineCidImages(html, parsed);
    const text = parsed.text || (html ? this.htmlToText(html) : undefined);

    return {
      headers,
      attachments,
      html,
      text,
      subject: parsed.subject ?? undefined,
      date: parsed.date ?? undefined,
    };
  }

  private inlineCidImages(html: string, parsed: ParsedMail): string {
    const byCid = new Map<string, { contentType: string; content: Buffer }>();
    for (const a of parsed.attachments ?? []) {
      if (a.cid && a.content) {
        byCid.set(a.cid.replace(/[<>]/g, '').toLowerCase(), {
          contentType: a.contentType || 'application/octet-stream',
          content: a.content as Buffer,
        });
      }
    }
    if (byCid.size === 0) return html;
    return html.replace(/(["'(])cid:([^"')\s]+)/gi, (match, open: string, cid: string) => {
      const found = byCid.get(cid.replace(/[<>]/g, '').toLowerCase());
      if (!found) return match;
      return `${open}data:${found.contentType};base64,${found.content.toString('base64')}`;
    });
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

interface ParsedResult {
  headers: Record<string, string>;
  attachments: AttachmentMeta[];
  html?: string;
  text?: string;
  subject?: string;
  date?: Date;
}
