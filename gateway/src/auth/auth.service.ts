import { Injectable, UnauthorizedException, Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../prisma/prisma.service';
import { SessionStoreService } from './session-store.service';
import { ImapPoolService } from '../imap/imap-pool.service';
import { AuditService } from '../audit/audit.service';
import { sha256 } from './crypto.util';
import type { LoginDto } from './dto/login.dto';

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
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

    return { accessToken, refreshToken, expiresIn: accessTtl };
  }

  private tenantFromEmail(email: string): string {
    return email.split('@')[1]?.toLowerCase() ?? 'unknown';
  }
}
