/**
 * Shared IMAP (Dovecot) connection options.
 *
 * Dovecot presents a certificate for its own hostname (e.g. host.example.com).
 * Connecting over 127.0.0.1 therefore fails with
 * "Hostname/IP does not match certificate's altnames". IMAP_TLS_SERVERNAME lets
 * us keep connecting to the loopback address while validating against the real
 * hostname (SNI). IMAP_TLS_REJECT_UNAUTHORIZED=false is the escape hatch for
 * self-signed / Plesk-internal certificates.
 *
 * A tenant bound to a specific MailServer row overrides these env defaults —
 * that is what makes one gateway able to serve several Plesk hosts.
 */
export interface ImapBaseOptions {
  host: string;
  port: number;
  secure: boolean;
  servername?: string;
  tls: { servername?: string; rejectUnauthorized: boolean };
}

export interface ImapOverrides {
  host?: string;
  port?: number;
  secure?: boolean;
  servername?: string;
  rejectUnauthorized?: boolean;
}

export function imapBaseOptions(overrides?: ImapOverrides | null): ImapBaseOptions {
  const envServername = process.env.IMAP_TLS_SERVERNAME?.trim() || undefined;
  const servername = overrides?.servername ?? envServername;
  const rejectUnauthorized =
    overrides?.rejectUnauthorized ?? (process.env.IMAP_TLS_REJECT_UNAUTHORIZED ?? 'true') === 'true';
  return {
    host: overrides?.host ?? process.env.IMAP_HOST ?? '127.0.0.1',
    port: overrides?.port ?? Number(process.env.IMAP_PORT ?? 993),
    secure: overrides?.secure ?? (process.env.IMAP_SECURE ?? 'true') === 'true',
    servername,
    tls: { servername, rejectUnauthorized },
  };
}
