export default () => ({
  http: {
    port: Number(process.env.PORT ?? 4000),
    corsOrigins: (process.env.CORS_ORIGINS ?? '').split(',').map((s) => s.trim()).filter(Boolean),
  },
  jwt: {
    accessSecret: process.env.JWT_ACCESS_SECRET ?? '',
    accessTtl: Number(process.env.JWT_ACCESS_TTL ?? 900),
    refreshSecret: process.env.JWT_REFRESH_SECRET ?? '',
    refreshTtl: Number(process.env.JWT_REFRESH_TTL ?? 60 * 60 * 24 * 14),
  },
  session: {
    encryptionKey: process.env.SESSION_ENCRYPTION_KEY ?? '',
  },
  imap: {
    host: process.env.IMAP_HOST ?? '127.0.0.1',
    port: Number(process.env.IMAP_PORT ?? 993),
    secure: (process.env.IMAP_SECURE ?? 'true') === 'true',
    poolMax: Number(process.env.IMAP_POOL_MAX ?? 4),
  },
  smtp: {
    host: process.env.SMTP_HOST ?? '127.0.0.1',
    port: Number(process.env.SMTP_PORT ?? 587),
    secure: (process.env.SMTP_SECURE ?? 'false') === 'true',
    requireTls: (process.env.SMTP_REQUIRE_TLS ?? 'true') === 'true',
  },
});
