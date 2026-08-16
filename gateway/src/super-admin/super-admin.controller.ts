import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { AuthUser, CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { AuditService } from '../audit/audit.service';
import { TenantService, PLATFORM_TENANT_ID } from '../tenants/tenant.service';
import {
  CreateMailServerDto,
  CreateTenantDto,
  UpdateBrandingDto,
  UpdateTenantStatusDto,
} from '../tenants/dto/tenant.dto';
import { PrismaService } from '../prisma/prisma.service';

import { PleskService } from '../plesk/plesk.service';

/** Platform-wide console. SUPER_ADMIN only, enforced server-side. */
@ApiTags('super-admin')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'), RolesGuard)
@Roles('SUPER_ADMIN')
@Controller('super-admin')
export class SuperAdminController {
  constructor(
    private readonly tenants: TenantService,
    private readonly audit: AuditService,
    private readonly prisma: PrismaService,
    private readonly plesk: PleskService,
  ) {}

  @Get('overview')
  async overview() {
    const [tenants, servers] = await Promise.all([
      this.tenants.listWithUsage(),
      this.tenants.listMailServers(),
    ]);
    return {
      tenants,
      servers: servers.map((s) => ({
        id: s.name,
        hostname: s.hostname,
        region: s.region,
        tenants: s._count.tenants,
        status: s.status,
      })),
      totals: {
        tenants: tenants.length,
        servers: servers.length,
        users: tenants.reduce((a, t) => a + t.users, 0),
      },
    };
  }

  @Get('tenants')
  listTenants() {
    return this.tenants.listWithUsage();
  }

  @Post('tenants')
  async createTenant(
    @CurrentUser() user: AuthUser,
    @Body() dto: CreateTenantDto,
    @Req() req: Request,
  ) {
    const tenant = await this.tenants.create(dto);
    await this.tenants.provisionTenant(tenant.id);
    if (dto.adminEmail) {
      // The mailbox may not have signed in yet — pre-seed the row so the very
      // first login already carries COMPANY_ADMIN.
      await this.prisma.user.upsert({
        where: { email: dto.adminEmail.toLowerCase() },
        update: { role: 'COMPANY_ADMIN', tenantId: tenant.id },
        create: {
          email: dto.adminEmail.toLowerCase(),
          tenantId: tenant.id,
          role: 'COMPANY_ADMIN',
          displayName: dto.adminEmail.split('@')[0],
        },
      });
    }
    await this.audit.record({
      userId: user.userId,
      tenantId: PLATFORM_TENANT_ID,
      type: 'tenant.create',
      email: user.email,
      ip: req.ip,
      meta: { tenantId: tenant.id, hostname: tenant.primaryHostname },
    });
    return tenant;
  }

  @Patch('tenants/:id/status')
  async setStatus(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: UpdateTenantStatusDto,
  ) {
    const tenant = await this.tenants.setStatus(id, dto.status);
    await this.audit.record({
      userId: user.userId,
      tenantId: PLATFORM_TENANT_ID,
      type: 'tenant.status',
      email: user.email,
      meta: { tenantId: id, status: dto.status },
    });
    return tenant;
  }

  @Patch('tenants/:id/branding')
  async setBranding(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: UpdateBrandingDto,
  ) {
    const tenant = await this.tenants.updateBranding(id, { ...dto });
    await this.audit.record({
      userId: user.userId,
      tenantId: PLATFORM_TENANT_ID,
      type: 'tenant.branding',
      email: user.email,
      meta: { tenantId: id },
    });
    return tenant;
  }

  @Get('mail-servers')
  listServers() {
    return this.tenants.listMailServers();
  }

  @Post('mail-servers')
  async createServer(@CurrentUser() user: AuthUser, @Body() dto: CreateMailServerDto) {
    const server = await this.tenants.createMailServer(dto);
    await this.audit.record({
      userId: user.userId,
      tenantId: PLATFORM_TENANT_ID,
      type: 'mail-server.create',
      email: user.email,
      meta: { name: server.name, hostname: server.hostname },
    });
    return server;
  }
@Get('domains')
async listDomains() {
  return this.plesk.listDomains();
}
  @Get('audit')
  audits() {
    return this.audit.list(PLATFORM_TENANT_ID, 100, null);
  }
}
