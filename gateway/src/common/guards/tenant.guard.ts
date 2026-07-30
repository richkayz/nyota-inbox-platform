import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { TenantService } from '../../tenants/tenant.service';
import { PLATFORM_TENANT_ID } from '../../tenants/tenant.service';
import type { AuthUser } from '../decorators/current-user.decorator';

/**
 * Tenant isolation enforcement (Phase 2). Runs after AuthGuard('jwt'):
 *
 *  1. The tenant in the JWT must still exist and be active (not suspended).
 *  2. When the request arrives on a host bound to a tenant, the JWT tenant must
 *     match it — a token minted for tenant A cannot be replayed on tenant B's host.
 *
 * MariaDB has no row-level security, so this guard plus explicit tenant-scoped
 * queries are the isolation boundary for metadata.
 */
@Injectable()
export class TenantGuard implements CanActivate {
  constructor(private readonly tenants: TenantService) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest();
    const user = req.user as AuthUser | undefined;
    if (!user) throw new ForbiddenException('Not authenticated');

    // The platform super-admin is intentionally cross-tenant.
    if (user.role === 'SUPER_ADMIN' || user.tenantId === PLATFORM_TENANT_ID) return true;

    const tenant = await this.tenants.findById(user.tenantId);
    if (!tenant) throw new ForbiddenException('Tenant no longer exists');
    if (tenant.status === 'suspended') throw new ForbiddenException('Tenant is suspended');

    const host = (req.headers['x-forwarded-host'] as string) ?? req.headers.host;
    const hostTenant = await this.tenants.findByHost(host);
    if (hostTenant && hostTenant.id !== tenant.id) {
      throw new ForbiddenException('Token does not belong to this tenant host');
    }

    req.tenant = tenant;
    return true;
  }
}
