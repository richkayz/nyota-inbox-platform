import { Injectable, UnauthorizedException, Logger } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../prisma/prisma.service';
import { SessionStoreService } from './session-store.service';
import { ImapPoolService } from '../imap/imap-pool.service';
import { AuditService } from '../audit/audit.service';
import { sha256 } from './crypto.util';
import type { LoginDto } from './dto/login.dto';
import {
  hashPlatformAdminPassword,
  isPlatformAdminEmail,
  platformAdminConfig,
  verifyPlatformAdminPassword,
} from './platform-admin';

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  /** Effective role of the signed-in principal, so the UI can route on it. */
  role: 'USER' | 'COMPANY_ADMIN' | 'SUPER_ADMIN';
  email: string;
  /** False for the platform admin, which has no mailbox behind it. */
  hasMailbox: boolean;
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly sessions: SessionStoreService,
    private readonly pool: ImapPoolService,
    private readonly audit: AuditService,
  ) {}

  async login(dto: LoginDto, ip?: string, userAgent?: string): Promise<TokenPair> {
    // Platform super-admin: authenticated against the configured scrypt hash,
    // never against Dovecot (this identity owns no mailbox).
    if (isPlatformAdminEmail(dto.email)) {
      return this.loginPlatformAdmin(dto, ip, userAgent);
    }

    // 1. Verify the mailbox credentials against Dovecot with a short IMAP handshake.
    const ok = await this.pool.verifyCredentials(dto.email, dto.password);
    if (!ok) {
      await this.audit.record({
        tenantId: dto.tenantId ?? 'unknown',
        type: 'login.failure',
        email: dto.email,
        ip,
        userAgent,
      });
      throw new UnauthorizedException('Invalid mailbox credentials');
    }

    // 2. Upsert the user metadata row (no password stored).
    const tenantId = dto.tenantId ?? this.tenantFromEmail(dto.email);
    const user = await this.prisma.user.upsert({
      where: { email: dto.email },
      update: { lastLoginAt: new Date(), tenantId },
      create: { email: dto.email, tenantId, displayName: dto.email.split('@')[0], lastLoginAt: new Date() },
    });

    // 3. Create the in-memory session with the encrypted password.
    const session = this.sessions.create({
      userId: user.id,
      email: user.email,
      tenantId: user.tenantId,
      password: dto.password,
    });

    // 4. Prime the IMAP pool.
    this.pool.warm(session.sessionId).catch((e) => this.logger.warn(`warm() failed: ${e?.message}`));

    // 5. Issue tokens.
    const tokens = await this.issueTokens(user.id, user.email, user.tenantId, user.role as any, session.sessionId, ip, userAgent);

    await this.audit.record({
      userId: user.id,
      tenantId: user.tenantId,
      type: 'login.success',
      email: user.email,
      ip,
      userAgent,
    });

    return tokens;
  }

  /**
   * Password change for the platform admin, callable from the sign-in screen.
   * Requires the current password, so it is safe without a session; the new
   * hash is persisted on the user row and takes precedence over the env hash.
   */
  async changePlatformAdminPassword(email: string, currentPassword: string, newPassword: string): Promise<void> {
    if (!isPlatformAdminEmail(email)) {
      throw new UnauthorizedException('Not a platform admin account');
    }
    const cfg = platformAdminConfig()!;
    const stored = await this.resolvePlatformAdminHash(cfg);
    if (!verifyPlatformAdminPassword(currentPassword, stored)) {
      await this.audit.record({ tenantId: 'platform', type: 'password.change.failure', email: cfg.email });
      throw new UnauthorizedException('Current password is incorrect');
    }
    const passwordHash = hashPlatformAdminPassword(newPassword);
    await this.prisma.user.upsert({
      where: { email: cfg.email },
      update: { passwordHash, role: 'SUPER_ADMIN', tenantId: 'platform' },
      create: {
        email: cfg.email,
        tenantId: 'platform',
        displayName: 'Platform Admin',
        role: 'SUPER_ADMIN',
        passwordHash,
      },
    });
    // Any existing refresh tokens are invalidated after a password change.
    const user = await this.prisma.user.findUnique({ where: { email: cfg.email } });
    if (user) {
      await this.prisma.refreshToken.updateMany({
        where: { userId: user.id, revokedAt: null },
        data: { revokedAt: new Date() },
      });
    }
    await this.audit.record({
      userId: user?.id,
      tenantId: 'platform',
      type: 'password.change.success',
      email: cfg.email,
    });
  }

  /** DB hash wins over the env hash once the admin has changed it on screen. */
  private async resolvePlatformAdminHash(cfg: { email: string; passwordHash: string }): Promise<string> {
    const row = await this.prisma.user.findUnique({ where: { email: cfg.email } });
    return row?.passwordHash?.trim() || cfg.passwordHash;
  }

  private async loginPlatformAdmin(dto: LoginDto, ip?: string, userAgent?: string): Promise<TokenPair> {
    const cfg = platformAdminConfig()!;
    const stored = await this.resolvePlatformAdminHash(cfg);
    if (!verifyPlatformAdminPassword(dto.password, stored)) {
      await this.audit.record({
        tenantId: 'platform',
        type: 'login.failure',
        email: cfg.email,
        ip,
        userAgent,
      });
      throw new UnauthorizedException('Invalid credentials');
    }


    const user = await this.prisma.user.upsert({
      where: { email: cfg.email },
      update: { role: 'SUPER_ADMIN', tenantId: 'platform', lastLoginAt: new Date() },
      create: {
        email: cfg.email,
        tenantId: 'platform',
        displayName: 'Platform Admin',
        role: 'SUPER_ADMIN',
        lastLoginAt: new Date(),
      },
    });

    // A session record is still created (so refresh works), but it holds a
    // random throwaway secret: there is no mailbox to open with it.
    const session = this.sessions.create({
      userId: user.id,
      email: user.email,
      tenantId: user.tenantId,
      password: randomUUID(),
    });

    const tokens = await this.issueTokens(
      user.id,
      user.email,
      user.tenantId,
      'SUPER_ADMIN',
      session.sessionId,
      ip,
      userAgent,
    );

    await this.audit.record({
      userId: user.id,
      tenantId: user.tenantId,
      type: 'login.success',
      email: user.email,
      ip,
      userAgent,
      meta: { platformAdmin: true },
    });

    return { ...tokens, hasMailbox: false };
  }

  async refresh(refreshToken: string, ip?: string, userAgent?: string): Promise<TokenPair> {
    let payload: any;
    try {
      payload = await this.jwt.verifyAsync(refreshToken, { secret: process.env.JWT_REFRESH_SECRET });
    } catch {
      throw new UnauthorizedException('Invalid refresh token');
    }
    const hash = sha256(refreshToken);
    const record = await this.prisma.refreshToken.findUnique({ where: { tokenHash: hash } });
    if (!record || record.revokedAt || record.expiresAt < new Date()) {
      throw new UnauthorizedException('Refresh token no longer valid');
    }
    // Session must still be live — otherwise mailbox password is gone.
    const session = this.sessions.get(payload.sid);
    if (!session) throw new UnauthorizedException('Session expired, please sign in again');

    // Rotate: revoke old, issue new.
    await this.prisma.refreshToken.update({
      where: { id: record.id },
      data: { revokedAt: new Date() },
    });
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: payload.sub } });
    return this.issueTokens(user.id, user.email, user.tenantId, user.role as any, payload.sid, ip, userAgent);
  }

  async logout(userId: string, sessionId: string, ip?: string, userAgent?: string): Promise<void> {
    this.sessions.destroy(sessionId);
    await this.pool.close(sessionId);
    await this.prisma.refreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (user) {
      await this.audit.record({
        userId: user.id,
        tenantId: user.tenantId,
        type: 'logout',
        email: user.email,
        ip,
        userAgent,
      });
    }
  }

  private async issueTokens(
    userId: string,
    email: string,
    tenantId: string,
    role: 'USER' | 'COMPANY_ADMIN' | 'SUPER_ADMIN',
    sessionId: string,
    ip?: string,
    userAgent?: string,
  ): Promise<TokenPair> {
    const accessTtl = Number(process.env.JWT_ACCESS_TTL ?? 900);
    const refreshTtl = Number(process.env.JWT_REFRESH_TTL ?? 60 * 60 * 24 * 14);

    const accessToken = await this.jwt.signAsync(
      { sub: userId, email, tenantId, sid: sessionId, role },
      { secret: process.env.JWT_ACCESS_SECRET, expiresIn: accessTtl },
    );
    const refreshToken = await this.jwt.signAsync(
      { sub: userId, sid: sessionId },
      { secret: process.env.JWT_REFRESH_SECRET, expiresIn: refreshTtl },
    );

    await this.prisma.refreshToken.create({
      data: {
        userId,
        tokenHash: sha256(refreshToken),
        userAgent: userAgent?.slice(0, 255),
        ip: ip?.slice(0, 64),
        expiresAt: new Date(Date.now() + refreshTtl * 1000),
      },
    });

    return { accessToken, refreshToken, expiresIn: accessTtl, role, email, hasMailbox: role !== 'SUPER_ADMIN' };
  }

  private tenantFromEmail(email: string): string {
    return email.split('@')[1]?.toLowerCase() ?? 'unknown';
  }
}
