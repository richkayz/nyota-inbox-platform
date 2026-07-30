import { Injectable, Logger } from '@nestjs/common';
import { createTransport, SendMailOptions, Transporter } from 'nodemailer';
import { SessionStoreService } from '../auth/session-store.service';
import { smtpBaseOptions } from './smtp-options';

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

  async send(sessionId: string, msg: OutgoingMessage): Promise<{ messageId: string; raw: Buffer }> {
    const session = this.sessions.get(sessionId);
    if (!session) throw new Error('No live session');
    const password = this.sessions.password(sessionId);
    if (!password) throw new Error('Session lost');

    const transporter: Transporter = createTransport({
      ...smtpBaseOptions(
        session.mailServer
          ? {
              host: session.mailServer.smtpHost,
              port: session.mailServer.smtpPort,
              secure: session.mailServer.smtpSecure,
              servername: session.mailServer.smtpTlsServername,
              rejectUnauthorized: session.mailServer.smtpRejectUnauthorized,
            }
          : null,
      ),
      auth: { user: session.email, pass: password },
    });

    try {
      const mail: SendMailOptions = {
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
      };
      const info = await transporter.sendMail(mail);

      // Build the Sent copy with Nodemailer's MIME composer rather than a
      // separate handwritten representation. This preserves multipart HTML,
      // plain text, inline content and attachments exactly as a mail client
      // expects, while keeping Postfix as the delivery path.
      const composer = createTransport({ streamTransport: true, buffer: true, newline: 'windows' });
      const composed = await composer.sendMail({ ...mail, messageId: info.messageId });
      const raw = Buffer.isBuffer(composed.message)
        ? composed.message
        : Buffer.from(String(composed.message ?? ''), 'utf8');

      return { messageId: info.messageId, raw };
    } finally {
      transporter.close();
    }
  }
}
