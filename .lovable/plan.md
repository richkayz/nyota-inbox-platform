## Multi-tenancy baseline (what exists today)

**Implemented**
- Tenant identity is a *string* (`tenantId`) derived at login: `dto.tenantId` if the UI sends one, otherwise inferred from the email domain (`tenantFromEmail`). Platform super-admin uses the reserved tenant `platform`.
- `tenantId` is embedded in the JWT access token and in the encrypted in-memory session record, so every authenticated request carries a tenant claim.
- Frontend resolves tenant from hostname (`inbox.<company>.<tld>`), with a registered list plus a deterministic auto-generated palette fallback, and applies branding CSS variables at first paint.

**Tenant-aware DB models**
- `User.tenantId` (indexed) — lazily created on first successful IMAP login.
- `AuditLog.tenantId` (indexed with `createdAt`) — hash-chained *per tenant*.
- Everything else (`RefreshToken`, `Contact`, `Signature`, `Preference`, `NotificationSetting`, `FolderCache`) is scoped only through `userId` → cascade from `User`, so it is tenant-scoped transitively, not directly.
- **There is no `Tenant` table.** Tenants exist only as strings + frontend constants + localStorage from the onboarding wizard.

**Isolation model today**
- Isolation is per-*user*, not per-tenant: all mail data lives in Dovecot and is reached only with that user's in-memory mailbox password, so cross-user mail access is structurally impossible.
- Metadata queries are filtered by `userId` from the JWT. Only the audit list filters by `tenantId`.
- No DB-level isolation (no RLS — MariaDB), no tenant-scoped connection/config, no per-tenant IMAP/SMTP host selection (single global `IMAP_HOST`/`SMTP_HOST`).

**Roles**
- Gateway enum: `USER | COMPANY_ADMIN | SUPER_ADMIN`; frontend mirror: `user | company_admin | super_admin`.
- `SUPER_ADMIN` is granted only to the env-configured platform admin (`PLATFORM_ADMIN_EMAIL` + scrypt hash, DB hash takes precedence).
- `COMPANY_ADMIN` exists in the schema but is never assigned and never enforced — there is **no roles guard** in the gateway; role checks are frontend-only (`beforeLoad` redirects in `/admin`, `/super-admin`).

**Tenant-aware APIs**
- `POST /auth/login` (accepts + resolves tenantId), `/auth/refresh` (propagates it), `GET /audit` (filters by `user.tenantId`), `/health/diagnostics` (reports it).
- Mail, contacts, settings endpoints are user-scoped only.

**Frontend multi-tenant functionality**
- Hostname → tenant resolution + `?tenant=` override, branding provider (colors, title, welcome copy), role-based nav, `/super-admin` console (tenants/servers/audit tables — mock arrays), 5-step onboarding wizard persisting drafts and "provisioned" tenants to localStorage.

## What's missing for a real multi-tenant SaaS
1. No `Tenant` entity: no hostnames, domains, plan, status, mailbox limits, branding, or mail-server binding in the DB.
2. No server-side tenant resolution (`Host` header → tenant) and no validation that a login's email domain belongs to the resolved tenant — today a user on tenant A's host can authenticate under tenant B.
3. No server-enforced authorization: `COMPANY_ADMIN` unusable, no `@Roles()` guard, no tenant-scoped admin endpoints.
4. No tenant repository queries: every metadata query trusts `userId` alone; a compromised token with a mismatched tenant is not detected.
5. Onboarding is a UI simulation — nothing is persisted server-side and Plesk provisioning is not wired.
6. Single global mail-server config; no per-tenant IMAP/SMTP host, no mail-server registry.
7. No per-tenant branding storage/upload, no per-tenant quotas/licensing, no tenant lifecycle (suspend/delete/export), no tenant-scoped rate limiting.

## Proposed next phase (ordered, additive)

**Phase 1 — Tenant as a first-class entity (foundation)**
- Prisma: `MailServer` (host, imap/smtp settings, region, status) and `Tenant` (id, slug, name, primaryHostname, allowedDomains[], plan, status, mailboxLimit, branding JSON, `mailServerId`).
- Add `TenantDomain` (hostname unique) so several hosts can map to one tenant.
- Migrate `User.tenantId` from free string → FK to `Tenant.id`, backfilling existing rows from their email domain; keep the index.
- Add `tenantId` to `Contact`/`Signature`/`FolderCache` writes as a denormalized guard column (defense in depth, cheap to filter).

**Phase 2 — Server-side tenant resolution + isolation enforcement**
- `TenantResolverMiddleware`: `Host` header → `TenantDomain` → request-scoped tenant; reject unknown hosts (except the platform console host).
- Login: resolve tenant from host, verify email domain ∈ `allowedDomains`, reject cross-tenant logins; drop `tenantFromEmail` guessing and the client-supplied `tenantId`.
- `TenantGuard`: assert JWT `tenantId` === resolved tenant, and tenant `status === ACTIVE`; a shared `scopedWhere()` helper injects `tenantId` into every metadata query.

**Phase 3 — Role enforcement**
- `@Roles()` decorator + `RolesGuard` on every admin route; keep frontend redirects as UX only.
- Tenant-admin endpoints: list/invite/suspend tenant mailboxes, tenant settings, tenant audit log (already tenant-filtered).
- Promote the first mailbox of a tenant to `COMPANY_ADMIN` during onboarding; super-admin can grant/revoke.

**Phase 4 — Real onboarding + per-tenant mail servers**
- `POST /super-admin/tenants` persisting the wizard payload transactionally (tenant + domains + mail-server binding + admin user), replacing localStorage; wizard becomes a thin client of it.
- Per-tenant IMAP/SMTP resolution in the pool/transport from `tenant.mailServer` instead of global env, with env as fallback default.
- Plesk provisioning adapter behind an interface (`noop` in dev, REST/CLI in prod) for domain + mailbox creation.

**Phase 5 — SaaS operations**
- Tenant branding persisted + logo/favicon upload, served to the UI via a public `GET /tenant/branding` (host-resolved, unauthenticated).
- Mailbox quotas/licensing enforcement, tenant suspend/resume/delete with data export, per-tenant rate limits, and super-admin metrics from real data.

### Technical notes
- MariaDB has no RLS, so isolation must be enforced in the application layer — hence the `scopedWhere()` helper plus denormalized `tenantId` columns rather than relying on cascade-through-`userId`.
- Phases 1–3 are non-breaking for the current UI: hostname branding and the mock super-admin tables keep working while the real endpoints land.
- The `platform` reserved tenant stays outside `Tenant` FK constraints (or gets a seeded row) so super-admin login keeps working through the migration.
