/**
 * Shared IMAP (Dovecot) connection options.
 *
 * Dovecot presents a certificate for its own hostname (e.g. host.example.com).
 * Connecting over 127.0.0.1 therefore fails with
 * "Hostname/IP does not match certificate's altnames". IMAP_TLS_SERVERNAME lets
 * us keep connecting to the loopback address while validating against the real
 * hostname (SNI). IMAP_TLS_REJECT_UNAUTHORIZED=false is the escape hatch for
 * self-signed / Plesk-internal certificates.
 */
export interface ImapBaseOptions {
  host: string;
  port: number;
  secure: boolean;
  servername?: string;
  tls: { servername?: string; rejectUnauthorized: boolean };
}

export function imapBaseOptions(): ImapBaseOptions {
  const servername = process.env.IMAP_TLS_SERVERNAME?.trim() || undefined;
  return {
    host: process.env.IMAP_HOST ?? '127.0.0.1',
    port: Number(process.env.IMAP_PORT ?? 993),
    secure: (process.env.IMAP_SECURE ?? 'true') === 'true',
    servername,
    tls: {
      servername,
      rejectUnauthorized: (process.env.IMAP_TLS_REJECT_UNAUTHORIZED ?? 'true') === 'true',
    },
  };
}
