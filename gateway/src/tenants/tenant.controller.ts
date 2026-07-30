import { Controller, Get, Req, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { TenantService } from './tenant.service';
import { AuthUser, CurrentUser } from '../common/decorators/current-user.decorator';

@ApiTags('tenant')
@Controller('tenant')
export class TenantController {
  constructor(private readonly tenants: TenantService) {}

  /**
   * Public, host-resolved branding for the sign-in screen. Contains no PII —
   * only what the login page needs to paint the right brand on first render.
   */
  @Get('branding')
  async branding(@Req() req: Request) {
    const host = (req.headers['x-forwarded-host'] as string) ?? req.headers.host;
    const payload = await this.tenants.brandingForHost(host);
    return payload ?? { id: null, host: TenantService.normalizeHost(host) };
  }

  /** The signed-in user's own tenant. */
  @Get('me')
  @ApiBearerAuth()
  @UseGuards(AuthGuard('jwt'))
  async me(@CurrentUser() user: AuthUser) {
    const tenant = await this.tenants.findById(user.tenantId);
    if (!tenant) return { id: user.tenantId, name: user.tenantId, status: 'unknown' };
    return {
      id: tenant.id,
      name: tenant.name,
      hostname: tenant.primaryHostname,
      plan: tenant.plan,
      status: tenant.status,
      mailboxLimit: tenant.mailboxLimit,
      allowedDomains: TenantService.domainList(tenant.allowedDomains),
      branding: tenant.branding ?? null,
      role: user.role,
    };
  }
}
