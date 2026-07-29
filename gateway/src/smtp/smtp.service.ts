import { Injectable, Logger } from '@nestjs/common';
import { createTransport, Transporter } from 'nodemailer';
import { SessionStoreService } from '../auth/session-store.service';

export interface OutgoingMessage {
  from: string;
  to: string[];
  cc?: string[];
  bcc?: string[];
  subject: string;
  text?: string;
  html?: string;
  inReplyTo?: string;
  references?: string[];
  attachments?: Array<{ filename: string; content: string; contentType?: string }>; // base64
}

/**
 * Sends mail through the local Postfix submission port using the user's
 * mailbox credentials. A fresh transporter is created per send so we don't
 * hold long-lived SMTP connections (Postfix handles pooling upstream).
 */
@Injectable()
export class SmtpService {
  private readonly logger = new Logger(SmtpService.name);

  constructor(private readonly sessions: SessionStoreService) {}

  async send(sessionId: string, msg: OutgoingMessage): Promise<{ messageId: string }> {
    const session = this.sessions.get(sessionId);
    if (!session) throw new Error('No live session');
    const password = this.sessions.password(sessionId);
    if (!password) throw new Error('Session lost');

    const transporter: Transporter = createTransport({
      host: process.env.SMTP_HOST ?? '127.0.0.1',
      port: Number(process.env.SMTP_PORT ?? 587),
      secure: (process.env.SMTP_SECURE ?? 'false') === 'true',
      requireTLS: (process.env.SMTP_REQUIRE_TLS ?? 'true') === 'true',
      auth: { user: session.email, pass: password },
    });

    try {
      const info = await transporter.sendMail({
        from: msg.from || session.email,
        to: msg.to,
        cc: msg.cc,
        bcc: msg.bcc,
        subject: msg.subject,
        text: msg.text,
        html: msg.html,
        inReplyTo: msg.inReplyTo,
        references: msg.references,
        attachments: msg.attachments?.map((a) => ({
          filename: a.filename,
          content: Buffer.from(a.content, 'base64'),
          contentType: a.contentType,
        })),
      });
      return { messageId: info.messageId };
    } finally {
      transporter.close();
    }
  }
}
