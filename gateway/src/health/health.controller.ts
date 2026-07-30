import { Controller, Get, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { ImapFlow } from 'imapflow';
import { createTransport } from 'nodemailer';
import { PrismaService } from '../prisma/prisma.service';
import { ImapPoolService } from '../imap/imap-pool.service';
import { SmtpService } from '../smtp/smtp.service';
import { SessionStoreService } from '../auth/session-store.service';
import { smtpBaseOptions } from '../smtp/smtp-options';
import { CurrentUser, AuthUser } from '../common/decorators/current-user.decorator';

const VERSION = process.env.npm_package_version ?? '0.1.0';

interface CheckResult {
  ok: boolean;
  latencyMs: number;
  detail?: string;
  meta?: Record<string, unknown>;
}

async function timed<T>(fn: () => Promise<T>): Promise<{ ok: boolean; latencyMs: number; value?: T; error?: string }> {
  const start = Date.now();
  try {
    const value = await fn();
    return { ok: true, latencyMs: Date.now() - start, value };
  } catch (err) {
    return { ok: false, latencyMs: Date.now() - start, error: (err as Error).message };
  }
}

@ApiTags('health')
@Controller('health')
export class HealthController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly pool: ImapPoolService,
    private readonly smtp: SmtpService,
    private readonly sessions: SessionStoreService,
  ) {}

  /** Basic liveness + version. No auth. */
  @Get()
  async root() {
    return {
      status: 'ok',
      version: VERSION,
      environment: process.env.NODE_ENV ?? 'development',
      gatewayUrl: process.env.PUBLIC_GATEWAY_URL ?? null,
      uptimeSeconds: Math.round(process.uptime()),
      timestamp: new Date().toISOString(),
    };
  }

  /** Unauthenticated: reaches Dovecot on the configured port and reads its greeting/capabilities. */
  @Get('imap')
  async imap(): Promise<CheckResult> {
    const host = process.env.IMAP_HOST ?? '127.0.0.1';
    const port = Number(process.env.IMAP_PORT ?? 993);
    const secure = (process.env.IMAP_SECURE ?? 'true') === 'true';
    const r = await timed(async () => {
      // We cannot log in without credentials, but we can open the socket and
      // read the greeting via imapflow's connect() when we pass no auth by
      // catching the specific "auth required" error. Simpler: raw TCP.
      const net = await import(secure ? 'tls' : 'net');
      return await new Promise<{ greeting: string }>((resolve, reject) => {
        const socket = (net as typeof import('tls')).connect
          ? (net as typeof import('tls')).connect({ host, port, servername: host, rejectUnauthorized: false }, () => {
              /* wait for data */
            })
          : (net as unknown as typeof import('net')).createConnection({ host, port });
        const timer = setTimeout(() => {
          socket.destroy();
          reject(new Error('Timed out reading IMAP greeting'));
        }, 4000);
        socket.once('data', (buf) => {
          clearTimeout(timer);
          const greeting = buf.toString('utf8').split('\r\n')[0];
          socket.end();
          resolve({ greeting });
        });
        socket.once('error', (err) => {
          clearTimeout(timer);
          reject(err);
        });
      });
    });
    return {
      ok: r.ok,
      latencyMs: r.latencyMs,
      detail: r.error,
      meta: { host, port, secure, greeting: r.value?.greeting ?? null },
    };
  }

  /** Unauthenticated: opens the SMTP submission port and reads the banner. */
  @Get('smtp')
  async smtpHealth(): Promise<CheckResult> {
    const opts = smtpBaseOptions();
    const r = await timed(async () => {
      const transporter = createTransport({ ...opts, connectionTimeout: 4000 });
      try {
        await transporter.verify();
        return { verified: true };
      } finally {
        transporter.close();
      }
    });
    return {
      ok: r.ok,
      latencyMs: r.latencyMs,
      detail: r.error,
      meta: {
        host: opts.host,
        port: opts.port,
        secure: opts.secure,
        requireTLS: opts.requireTLS,
        tlsServername: opts.tls.servername ?? null,
        rejectUnauthorized: opts.tls.rejectUnauthorized,
      },
    };
  }

  /** Unauthenticated: `SELECT 1` against MariaDB via Prisma. */
  @Get('database')
  async database(): Promise<CheckResult> {
    const r = await timed(async () => {
      await this.prisma.$queryRawUnsafe('SELECT 1 AS ok');
      return true;
    });
    return {
      ok: r.ok,
      latencyMs: r.latencyMs,
      detail: r.error,
      meta: { driver: 'prisma+mariadb' },
    };
  }

  /**
   * Authenticated end-to-end diagnostics. Uses the caller's live session to
   * hit real Dovecot / Postfix with the actual mailbox credentials.
   */
  @Get('diagnostics')
  @ApiBearerAuth()
  @UseGuards(AuthGuard('jwt'))
  async diagnostics(@CurrentUser() user: AuthUser) {
    const [basic, imap, smtp, db] = await Promise.all([this.root(), this.imap(), this.smtpHealth(), this.database()]);

    // Authenticated IMAP probe using the session's real credentials.
    const password = this.sessions.password(user.sessionId);
    const imapAuth = await timed(async () => {
      if (!password) throw new Error('Session has no cached password');
      const client = new ImapFlow({
        host: process.env.IMAP_HOST ?? '127.0.0.1',
        port: Number(process.env.IMAP_PORT ?? 993),
        secure: (process.env.IMAP_SECURE ?? 'true') === 'true',
        auth: { user: user.email, pass: password },
        logger: false,
        emitLogs: false,
      });
      await client.connect();
      const capabilities = Array.from(client.capabilities?.keys?.() ?? []) as string[];
      const list = await client.list();
      const folders = list.map((f) => f.path);
      const tls = Boolean((client as unknown as { secureConnection?: boolean }).secureConnection);
      await client.logout();
      return {
        capabilities,
        folders,
        folderCount: folders.length,
        supportsIdle: capabilities.includes('IDLE'),
        tls,
      };
    });

    // Authenticated SMTP verify.
    const smtpAuth = await timed(async () => {
      if (!password) throw new Error('Session has no cached password');
      const transporter = createTransport({
        host: process.env.SMTP_HOST ?? '127.0.0.1',
        port: Number(process.env.SMTP_PORT ?? 587),
        secure: (process.env.SMTP_SECURE ?? 'false') === 'true',
        requireTLS: (process.env.SMTP_REQUIRE_TLS ?? 'true') === 'true',
        auth: { user: user.email, pass: password },
        connectionTimeout: 4000,
      });
      try {
        await transporter.verify();
        return { verified: true };
      } finally {
        transporter.close();
      }
    });

    return {
      gateway: basic,
      mode: 'live' as const,
      session: {
        email: user.email,
        tenantId: user.tenantId,
        role: user.role,
        sessionId: user.sessionId,
        jwtValid: true,
      },
      checks: {
        imapReachable: imap,
        smtpReachable: smtp,
        database: db,
        imapAuth: {
          ok: imapAuth.ok,
          latencyMs: imapAuth.latencyMs,
          detail: imapAuth.error,
          meta: imapAuth.value,
        },
        smtpAuth: {
          ok: smtpAuth.ok,
          latencyMs: smtpAuth.latencyMs,
          detail: smtpAuth.error,
        },
      },
    };
  }

  /** Authenticated: perform a live IMAP LOGIN and NOOP. */
  @Get('diagnostics/test-imap')
  @ApiBearerAuth()
  @UseGuards(AuthGuard('jwt'))
  async testImap(@CurrentUser() user: AuthUser) {
    const password = this.sessions.password(user.sessionId);
    return timed(async () => {
      if (!password) throw new Error('Session has no cached password');
      const client = new ImapFlow({
        host: process.env.IMAP_HOST ?? '127.0.0.1',
        port: Number(process.env.IMAP_PORT ?? 993),
        secure: (process.env.IMAP_SECURE ?? 'true') === 'true',
        auth: { user: user.email, pass: password },
        logger: false,
        emitLogs: false,
      });
      await client.connect();
      await client.noop();
      const capabilities = Array.from(client.capabilities?.keys?.() ?? []) as string[];
      await client.logout();
      return { ok: true, capabilities };
    });
  }

  /** Authenticated: SMTP verify with real mailbox credentials. */
  @Get('diagnostics/test-smtp')
  @ApiBearerAuth()
  @UseGuards(AuthGuard('jwt'))
  async testSmtp(@CurrentUser() user: AuthUser) {
    const password = this.sessions.password(user.sessionId);
    return timed(async () => {
      if (!password) throw new Error('Session has no cached password');
      const transporter = createTransport({
        host: process.env.SMTP_HOST ?? '127.0.0.1',
        port: Number(process.env.SMTP_PORT ?? 587),
        secure: (process.env.SMTP_SECURE ?? 'false') === 'true',
        requireTLS: (process.env.SMTP_REQUIRE_TLS ?? 'true') === 'true',
        auth: { user: user.email, pass: password },
        connectionTimeout: 4000,
      });
      try {
        await transporter.verify();
        return { ok: true };
      } finally {
        transporter.close();
      }
    });
  }
}
