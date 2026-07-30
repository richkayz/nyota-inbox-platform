import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export const PLATFORM_TENANT_ID = 'platform';

export interface ResolvedMailServer {
  imapHost: string;
  imapPort: number;
  imapSecure: boolean;
  imapTlsServername?: string;
  imapRejectUnauthorized: boolean;
  smtpHost: string;
  smtpPort: number;
  smtpSecure: boolean;
  smtpTlsServername?: string;
  smtpRejectUnauthorized: boolean;
}

export interface TenantBrandingPayload {
  id: string;
  name: string;
  hostname: string;
  status: string;
  plan: string;
  primary?: string;
  accent?: string;
  logoUrl?: string;
  faviconUrl?: string;
  welcomeMessage?: string;
  supportEmail?: string;
}

/**
 * Tenant resolution and scoping.
 *
 * A tenant is identified by its slug (Tenant.id), which is also what lands in
 * the JWT `tenantId` claim. Hosts resolve through `primaryHostname` first and
 * then through the `TenantDomain` table.
 */
@Injectable()
export class TenantService {
  private readonly logger = new Logger(TenantService.name);

  constructor(private readonly prisma: PrismaService) {}

  /** Normalises a Host header into a bare lowercase hostname. */
  static normalizeHost(host: string | undefined | null): string | null {
    if (!host) return null;
    return host.toLowerCase().split(',')[0].trim().split(':')[0] || null;
  }

  /** `inbox.company.com` -> `company`; `company.com` -> `company`. */
  static slugFromHost(host: string): string {
    const parts = host.split('.');
    const meaningful = parts[0] === 'inbox' && parts.length >= 3 ? parts[1] : parts[0];
    return (meaningful || 'tenant').replace(/[^a-z0-9-]/g, '');
  }

  static domainOfEmail(email: string): string {
    return email.split('@')[1]?.toLowerCase() ?? '';
  }

  async findByHost(host: string | undefined | null) {
    const hostname = TenantService.normalizeHost(host);
    if (!hostname) return null;
    const direct = await this.prisma.tenant.findUnique({ where: { primaryHostname: hostname } });
    if (direct) return direct;
    const mapped = await this.prisma.tenantDomain.findUnique({
      where: { hostname },
      include: { tenant: true },
    });
    return mapped?.tenant ?? null;
  }

  async findById(id: string) {
    return this.prisma.tenant.findUnique({ where: { id } });
  }

  async getOrThrow(id: string) {
    const t = await this.findById(id);
    if (!t) throw new NotFoundException(`Unknown tenant ${id}`);
    return t;
  }

  list() {
    return this.prisma.tenant.findMany({
      orderBy: { createdAt: 'desc' },
      include: { mailServer: true, domains: true },
    });
  }

  /** Mailbox count per tenant, for the super-admin console. */
  async listWithUsage() {
    const tenants = await this.list();
    const counts = await this.prisma.user.groupBy({ by: ['tenantId'], _count: { _all: true } });
    const byTenant = new Map(counts.map((c) => [c.tenantId, c._count._all]));
    return tenants.map((t) => ({
      id: t.id,
      name: t.name,
      hostname: t.primaryHostname,
      allowedDomains: TenantService.domainList(t.allowedDomains),
      plan: t.plan,
      status: t.status,
      mailboxLimit: t.mailboxLimit,
      users: byTenant.get(t.id) ?? 0,
      server: t.mailServer?.name ?? null,
      autoCreated: t.autoCreated,
      createdAt: t.createdAt,
      branding: (t.branding as Record<string, unknown> | null) ?? null,
      extraDomains: t.domains.map((d) => d.hostname),
    }));
  }

  static domainList(raw: string): string[] {
    return raw
      .split(',')
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean);
  }

  /**
   * Resolves the tenant a login belongs to.
   *
   * Priority: the tenant bound to the request host, otherwise the tenant that
   * claims the mailbox domain. When neither exists the tenant is auto-created
   * (marked `autoCreated`) so existing single-server deployments and demo hosts
   * keep working — Phase 5 can flip this to a hard rejection.
   */
  async resolveForLogin(email: string, host: string | undefined | null) {
    const domain = TenantService.domainOfEmail(email);
    const byHost = await this.findByHost(host);
    if (byHost) {
      const allowed = TenantService.domainList(byHost.allowedDomains);
      if (allowed.length > 0 && !allowed.includes(domain)) {
        throw new BadRequestException(
          `Mailbox domain @${domain} is not allowed on ${byHost.primaryHostname}`,
        );
      }
      return byHost;
    }

    const byDomain = await this.prisma.tenant.findFirst({
      where: { allowedDomains: { contains: domain } },
    });
    if (byDomain && TenantService.domainList(byDomain.allowedDomains).includes(domain)) {
      return byDomain;
    }

    const hostname = TenantService.normalizeHost(host) ?? `inbox.${domain}`;
    const slug = TenantService.slugFromHost(domain || hostname) || 'tenant';
    return this.autoProvision(slug, hostname, domain);
  }

  /** Idempotent bootstrap of a tenant discovered at runtime. */
  async autoProvision(slug: string, hostname: string, domain: string) {
    const existing = await this.prisma.tenant.findUnique({ where: { id: slug } });
    if (existing) return existing;
    const hostTaken = await this.prisma.tenant.findUnique({ where: { primaryHostname: hostname } });
    this.logger.log(`Auto-provisioning tenant "${slug}" for @${domain}`);
    return this.prisma.tenant.create({
      data: {
        id: slug,
        name: slug.charAt(0).toUpperCase() + slug.slice(1),
        primaryHostname: hostTaken ? `${slug}.auto.local` : hostname,
        allowedDomains: domain,
        status: 'active',
        autoCreated: true,
      },
    });
  }

  /** The platform console tenant — super admin has no mailbox and no domain. */
  async ensurePlatformTenant() {
    const existing = await this.prisma.tenant.findUnique({ where: { id: PLATFORM_TENANT_ID } });
    if (existing) return existing;
    return this.prisma.tenant.create({
      data: {
        id: PLATFORM_TENANT_ID,
        name: 'Nyota Platform',
        primaryHostname: process.env.PLATFORM_HOSTNAME?.trim() || 'platform.nyota.local',
        plan: 'platform',
        status: 'active',
        mailboxLimit: 0,
      },
    });
  }

  async create(input: {
    slug: string;
    name: string;
    hostname: string;
    allowedDomains: string[];
    plan?: string;
    status?: string;
    mailboxLimit?: number;
    mailServerId?: string;
    branding?: Record<string, unknown>;
    extraDomains?: string[];
  }) {
    const slug = input.slug.toLowerCase().replace(/[^a-z0-9-]/g, '');
    if (!slug) throw new BadRequestException('slug is required');
    const clash = await this.prisma.tenant.findFirst({
      where: { OR: [{ id: slug }, { primaryHostname: input.hostname.toLowerCase() }] },
    });
    if (clash && !clash.autoCreated) {
      throw new BadRequestException('A tenant with that slug or hostname already exists');
    }
    const data = {
      name: input.name,
      primaryHostname: input.hostname.toLowerCase(),
      allowedDomains: input.allowedDomains.map((d) => d.toLowerCase()).join(','),
      plan: input.plan ?? 'starter',
      status: input.status ?? 'provisioning',
      mailboxLimit: input.mailboxLimit ?? 25,
      mailServerId: input.mailServerId ?? null,
      branding: (input.branding ?? undefined) as any,
      autoCreated: false,
    };
    const tenant = clash
      ? await this.prisma.tenant.update({ where: { id: clash.id }, data })
      : await this.prisma.tenant.create({ data: { id: slug, ...data } });

    for (const hostname of input.extraDomains ?? []) {
      await this.prisma.tenantDomain.upsert({
        where: { hostname: hostname.toLowerCase() },
        update: { tenantId: tenant.id },
        create: { tenantId: tenant.id, hostname: hostname.toLowerCase() },
      });
    }
    return tenant;
  }

  async setStatus(id: string, status: string) {
    await this.getOrThrow(id);
    return this.prisma.tenant.update({ where: { id }, data: { status } });
  }

  async updateBranding(id: string, branding: Record<string, unknown>) {
    await this.getOrThrow(id);
    return this.prisma.tenant.update({ where: { id }, data: { branding: branding as any } });
  }

  /** Public branding payload for the login screen (host-resolved, no auth). */
  async brandingForHost(host: string | undefined | null): Promise<TenantBrandingPayload | null> {
    const tenant = await this.findByHost(host);
    if (!tenant) return null;
    const b = (tenant.branding as Record<string, string> | null) ?? {};
    return {
      id: tenant.id,
      name: tenant.name,
      hostname: tenant.primaryHostname,
      status: tenant.status,
      plan: tenant.plan,
      primary: b.primary,
      accent: b.accent,
      logoUrl: b.logoUrl,
      faviconUrl: b.faviconUrl,
      welcomeMessage: b.welcomeMessage,
      supportEmail: b.supportEmail,
    };
  }

  /** Per-tenant mail server, or null to fall back to the global env config. */
  async mailServerFor(tenantId: string): Promise<ResolvedMailServer | null> {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      include: { mailServer: true },
    });
    const s = tenant?.mailServer;
    if (!s) return null;
    return {
      imapHost: s.imapHost,
      imapPort: s.imapPort,
      imapSecure: s.imapSecure,
      imapTlsServername: s.imapTlsServername ?? undefined,
      imapRejectUnauthorized: s.imapRejectUnauthorized,
      smtpHost: s.smtpHost,
      smtpPort: s.smtpPort,
      smtpSecure: s.smtpSecure,
      smtpTlsServername: s.smtpTlsServername ?? undefined,
      smtpRejectUnauthorized: s.smtpRejectUnauthorized,
    };
  }

  listMailServers() {
    return this.prisma.mailServer.findMany({
      orderBy: { name: 'asc' },
      include: { _count: { select: { tenants: true } } },
    });
  }

  createMailServer(input: {
    name: string;
    hostname: string;
    region?: string;
    imapHost?: string;
    imapPort?: number;
    imapSecure?: boolean;
    imapTlsServername?: string;
    smtpHost?: string;
    smtpPort?: number;
    smtpSecure?: boolean;
    smtpTlsServername?: string;
  }) {
    return this.prisma.mailServer.create({
      data: {
        name: input.name,
        hostname: input.hostname,
        region: input.region,
        imapHost: input.imapHost ?? input.hostname,
        imapPort: input.imapPort ?? 993,
        imapSecure: input.imapSecure ?? true,
        imapTlsServername: input.imapTlsServername ?? input.hostname,
        smtpHost: input.smtpHost ?? input.hostname,
        smtpPort: input.smtpPort ?? 587,
        smtpSecure: input.smtpSecure ?? false,
        smtpTlsServername: input.smtpTlsServername ?? input.hostname,
      },
    });
  }

  /** Mailbox licensing: is there room for one more mailbox on this tenant? */
  async hasMailboxCapacity(tenantId: string): Promise<boolean> {
    const tenant = await this.findById(tenantId);
    if (!tenant || tenant.mailboxLimit <= 0) return true;
    const used = await this.prisma.user.count({ where: { tenantId } });
    return used < tenant.mailboxLimit;
  }
}
