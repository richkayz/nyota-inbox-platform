import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { SessionStoreService } from './session-store.service';
import type { AuthUser } from '../common/decorators/current-user.decorator';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(private readonly sessions: SessionStoreService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: process.env.JWT_ACCESS_SECRET ?? '',
    });
  }

  async validate(payload: {
    sub: string;
    email: string;
    tenantId: string;
    sid: string;
    role: AuthUser['role'];
  }): Promise<AuthUser> {
    // Access token must still map to a live session (mailbox password in memory).
    const session = this.sessions.get(payload.sid);
    if (!session) throw new UnauthorizedException('Session expired');
    return {
      userId: payload.sub,
      email: payload.email,
      tenantId: payload.tenantId,
      sessionId: payload.sid,
      role: payload.role,
    };
  }
}
