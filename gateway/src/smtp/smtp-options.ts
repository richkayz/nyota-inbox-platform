/**
 * Shared SMTP transport options.
 *
 * Postfix presents a certificate for its own hostname (e.g. mail.example.com).
 * When we connect over the loopback address the TLS handshake fails with
 * "Hostname/IP does not match certificate's altnames". SMTP_TLS_SERVERNAME lets
 * us keep connecting to 127.0.0.1 while validating against the real hostname
 * (SNI). SMTP_TLS_REJECT_UNAUTHORIZED=false is the escape hatch for self-signed
 * or Plesk-internal certificates.
 */
export interface SmtpBaseOptions {
  host: string;
  port: number;
  secure: boolean;
  requireTLS: boolean;
  name?: string;
  tls: { servername?: string; rejectUnauthorized: boolean };
}

export interface SmtpOverrides {
  host?: string;
  port?: number;
  secure?: boolean;
  servername?: string;
  rejectUnauthorized?: boolean;
}

/**
 * A tenant bound to a MailServer row overrides the env defaults, so one gateway
 * can relay through several Postfix hosts.
 */
export function smtpBaseOptions(overrides?: SmtpOverrides | null): SmtpBaseOptions {
  const host = overrides?.host ?? process.env.SMTP_HOST ?? '127.0.0.1';
  const servername = overrides?.servername ?? (process.env.SMTP_TLS_SERVERNAME?.trim() || undefined);
  return {
    host,
    port: overrides?.port ?? Number(process.env.SMTP_PORT ?? 587),
    secure: overrides?.secure ?? (process.env.SMTP_SECURE ?? 'false') === 'true',
    requireTLS: (process.env.SMTP_REQUIRE_TLS ?? 'true') === 'true',
    tls: {
      servername,
      rejectUnauthorized:
        overrides?.rejectUnauthorized ??
        (process.env.SMTP_TLS_REJECT_UNAUTHORIZED ?? 'true') === 'true',
    },
  };
}
