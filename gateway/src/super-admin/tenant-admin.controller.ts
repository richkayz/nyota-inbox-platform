import { Body, Controller, ForbiddenException, Get, Param, Patch, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { IsIn, IsString } from 'class-validator';
import { AuthUser, CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { TenantGuard } from '../common/guards/tenant.guard';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { TenantService } from '../tenants/tenant.service';

class UpdateRoleDto {
  @IsString() @IsIn(['USER', 'COMPANY_ADMIN']) role!: 'USER' | 'COMPANY_ADMIN';
}

/**
 * Company-admin console. Every query is scoped to the caller's tenant — the
 * tenant id comes from the JWT and is verified by TenantGuard, never from input.
 */
@ApiTags('tenant-admin')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'), RolesGuard, TenantGuard)
@Roles('COMPANY_ADMIN', 'SUPER_ADMIN')
@Controller('tenant-admin')
export class TenantAdminController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly tenants: TenantService,
  ) {}

  @Get('overview')
  async overview(@CurrentUser() user: AuthUser) {
    const [tenant, users, capacity] = await Promise.all([
      this.tenants.findById(user.tenantId),
      this.prisma.user.count({ where: { tenantId: user.tenantId } }),
      this.tenants.hasMailboxCapacity(user.tenantId),
    ]);
    return {
      tenant: tenant
        ? {
            id: tenant.id,
            name: tenant.name,
            hostname: tenant.primaryHostname,
            plan: tenant.plan,
            status: tenant.status,
            mailboxLimit: tenant.mailboxLimit,
            allowedDomains: TenantService.domainList(tenant.allowedDomains),
          }
        : null,
      mailboxesUsed: users,
      hasCapacity: capacity,
    };
  }

  @Get('users')
  async users(@CurrentUser() user: AuthUser) {
    const rows = await this.prisma.user.findMany({
      where: { tenantId: user.tenantId },
      orderBy: { email: 'asc' },
      select: { id: true, email: true, displayName: true, role: true, lastLoginAt: true, createdAt: true },
    });
    return rows;
  }

  @Patch('users/:id/role')
  async setRole(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: UpdateRoleDto,
  ) {
    const target = await this.prisma.user.findUnique({ where: { id } });
    // Tenant isolation: a company admin can only touch its own tenant's users.
    if (!target || (user.role !== 'SUPER_ADMIN' && target.tenantId !== user.tenantId)) {
      throw new ForbiddenException('User is not in your tenant');
    }
    if (target.role === 'SUPER_ADMIN') {
      throw new ForbiddenException('Cannot modify the platform super-admin');
    }
    const updated = await this.prisma.user.update({ where: { id }, data: { role: dto.role } });
    await this.audit.record({
      userId: user.userId,
      tenantId: target.tenantId,
      type: 'user.role.change',
      email: user.email,
      meta: { target: target.email, role: dto.role },
    });
    return { id: updated.id, email: updated.email, role: updated.role };
  }
}
