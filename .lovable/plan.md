
# Nyota Inbox — Technical Architecture Blueprint (v2)

Revised per review. Highlights: **no persisted mailbox passwords**, first-class `mailboxes` table with Super-Admin-only licensing, tamper-evident audit log, notification center, tenant dashboard, formal plugin framework, onboarding wizard, full white-label, strict Plesk abstraction, and multi-mail-server ready.

---

## 1. Overall System Architecture

```text
                    ┌──────────────────────────────────────┐
   Browser (SPA) ──►│  Lovable App  (TanStack Start)       │
   inbox.acme.com   │  - SSR + React 19                    │
                    │  - Server functions (Workers)        │
                    │  - Encrypted server session (cookie) │
                    │  - Tenant resolver (Host header)     │
                    │  - RBAC · branding · licensing       │
                    └───────┬───────────────────┬──────────┘
                            │                   │
              signed HMAC   │                   │ Postgres/TLS
              short-lived   ▼                   ▼
                 ┌────────────────────┐  ┌──────────────────────┐
                 │  Mail Gateway      │  │ Lovable Cloud (PG)   │
                 │  (Node, stateless) │  │ tenants, mailboxes,  │
                 │  - imapflow        │  │ users, user_roles,   │
                 │  - nodemailer      │  │ branding, subs,      │
                 │  - Plesk REST/CLI  │  │ audit, notifications,│
                 │  - Per-req creds   │  │ mail_servers, ...    │
                 └───┬───────────┬────┘  └──────────────────────┘
                     │ IMAP/SMTP │ HTTPS (Plesk)
                     ▼           ▼
              ┌────────────────────────────┐
              │ Plesk Server Pool (N ≥ 1)  │
              │  server-a · server-b · ... │
              └────────────────────────────┘
```

Trust boundaries (unchanged):
- **App**: UI, RBAC, session, licensing. Never talks to Plesk / IMAP / SMTP.
- **Mail Gateway**: only component with mail-protocol or Plesk access. Stateless.
- **Postgres**: application metadata only. Zero email content, zero mailbox passwords.

---

## 2. Credential Handling (revised)

**Mailbox passwords are never persisted.** Not encrypted-at-rest, not in the DB, not on disk.

Flow:

1. User submits `{email, password}` at `/login`.
2. App resolves tenant + assigned `mail_server` from Host.
3. App calls `gateway.imap.verify(host, user, password)`.
4. On success, app creates a **server-side encrypted session** (see §7):
   - Session key = HMAC(cookie_id, server master key).
   - Server-side session store holds: `user_id`, `tenant_id`, `mailbox_id`, and **`enc_creds`** encrypted with the derived session key.
   - Cookie holds only `cookie_id` (opaque, HttpOnly, Secure, SameSite=Lax).
5. Every subsequent mail request re-hydrates creds in memory only for the duration of that request and passes them to the gateway.
6. On logout, session expiry, tenant suspension, or user disable → the session record and its `enc_creds` are wiped. No background job can access mail after logout.
7. No "remember password" mode. No offline workers acting on the user's behalf. Vacation autoresponder and forwarding are set through Plesk under the tenant's service credentials, not the user's.

Session storage: `sessions` table with short TTL (e.g. 12h idle, 24h absolute), rotating cookie id on privilege change. Session encryption key is a Lovable secret — losing it invalidates every session, which is the intended blast radius.

---

## 3. Database Schema

Enums:

```text
app_role              (super_admin, company_admin, user)
tenant_status         (provisioning, active, suspended)
mailbox_status        (active, suspended, deprovisioned)
subscription_status   (trial, active, past_due, canceled)
onboarding_step       (company, domain, dns, ssl, imap, smtp, branding, admin, mailboxes, welcome, live)
notification_severity (info, warning, critical)
audit_action          (login, logout, login_failed, password_reset_requested, password_reset_completed,
                       mailbox_created, mailbox_updated, mailbox_deleted, mailbox_quota_changed,
                       branding_updated, tenant_created, tenant_suspended, tenant_resumed,
                       role_assigned, role_revoked, license_changed, subscription_updated,
                       server_assigned, plugin_enabled, plugin_disabled)
```

Core tables:

```text
mail_servers                             -- multi-server ready
  id uuid pk, label, region,
  imap_host, imap_port, imap_tls,
  smtp_host, smtp_port, smtp_tls,
  plesk_endpoint, plesk_auth_ref,        -- ref to secret store; never plaintext
  gateway_base_url,                      -- which gateway fronts this server
  capacity_mailboxes int, status, created_at

tenants
  id uuid pk, name, slug unique, custom_domain citext unique,
  mail_server_id fk→mail_servers,        -- tenant pinned to one server (movable)
  status tenant_status,
  licensed_mailboxes int not null default 0,   -- Super Admin only
  feature_flags jsonb default '{}',
  onboarding_state onboarding_step default 'company',
  created_at, updated_at

tenant_branding                          -- full white-label
  tenant_id pk fk,
  logo_url, favicon_url, login_bg_url,
  primary_color, secondary_color, accent_color,
  font_family_display, font_family_body,   -- Google font ids or self-hosted
  welcome_message, support_email,
  theme_default (light|dark|system)

subscriptions
  id, tenant_id fk, plan, seats, renews_at,
  status subscription_status, external_ref

users                                    -- app identity ONLY; no mail password
  id uuid pk, tenant_id fk,
  email citext, display_name,
  enabled bool default true,
  signature_html, vacation_enabled, vacation_message,
  theme_preference, locale,
  last_login_at, created_at, updated_at,
  UNIQUE(tenant_id, email)

user_roles                               -- separate table, mandatory
  id, user_id fk, tenant_id fk, role app_role,
  UNIQUE(user_id, role, tenant_id)

mailboxes                                -- licensed resource
  id uuid pk, tenant_id fk,
  email citext, display_name,
  quota_mb int not null,
  status mailbox_status default 'active',
  assigned_user_id uuid fk→users null,
  mail_server_id fk→mail_servers,        -- inherits tenant default; overridable
  created_by uuid fk→users,              -- must be a super_admin
  created_at, updated_at,
  UNIQUE(tenant_id, email)

sessions                                 -- server-side, encrypted creds live only here
  id uuid pk, cookie_id_hash,
  user_id fk, tenant_id fk, mailbox_id fk null,
  enc_creds bytea, iv bytea, tag bytea,  -- AES-256-GCM, key derived per session
  user_agent, ip inet,
  created_at, last_seen_at, expires_at, revoked_at

password_reset_tokens
  id, user_id fk, token_hash, expires_at, used_at

audit_logs                               -- append-only, tamper-evident
  id bigserial pk,
  tenant_id fk null,                      -- null for platform-level
  actor_user_id fk null,                  -- null for system
  actor_role app_role,
  action audit_action,
  target_type text, target_id text,
  previous_value jsonb, new_value jsonb,
  ip inet, user_agent text,
  created_at timestamptz default now(),
  prev_hash bytea, row_hash bytea         -- hash chain for tamper detection
  -- No UPDATE/DELETE grants (see §9)

notifications
  id, tenant_id fk null, audience (super_admin|company_admin|user),
  severity notification_severity, kind text,
  title, body, link_url,
  meta jsonb, created_at,
  read_by jsonb default '{}'              -- {user_id: read_at}

plugins                                  -- registry of installable modules
  id text pk,                              -- 'contacts', 'calendar', 'ai', ...
  name, version, description, icon,
  required_role app_role, default_enabled bool,
  routes jsonb, permissions text[], created_at

tenant_plugins                           -- per-tenant enablement
  tenant_id fk, plugin_id fk,
  enabled bool, config jsonb,
  enabled_by uuid fk→users, enabled_at,
  PRIMARY KEY (tenant_id, plugin_id)

domain_verifications                     -- onboarding
  id, tenant_id fk, domain,
  dns_token, dns_verified_at,
  ssl_status, ssl_verified_at,
  imap_test_at, imap_ok bool,
  smtp_test_at, smtp_ok bool,
  updated_at
```

Every `CREATE TABLE public.*` is followed by explicit `GRANT`s. All tenant-scoped tables enable RLS and route access through `has_role(auth.uid(), _role, tenant_id)` SECURITY DEFINER.

Mailboxes storage-used is read live from Plesk via the gateway (no persistent replica), cached briefly per request.

---

## 4. Multi-Tenant Design

- Tenant identity = Host header → `tenants.custom_domain` → `tenant_id` in request context.
- Shared DB, shared schema, RLS row isolation + app-layer guard.
- **Multi-server**: `tenants.mail_server_id` selects the Plesk server; mailboxes may override. Gateway routes each request to the correct upstream. New servers register in `mail_servers` and immediately become assignable — no code change to onboard a server.
- Suspension: `tenants.status='suspended'` → all sessions revoked, login blocked, branded suspension screen.
- Fallback host `<slug>.nyota.one` always resolves; custom domain adds on top.

---

## 5. User Roles & Permissions

| Capability | Super Admin | Company Admin | User |
|---|---|---|---|
| Create / suspend tenants | ✓ | | |
| Assign tenant to `mail_server` | ✓ | | |
| Register / rotate Plesk credentials | ✓ | | |
| Set `licensed_mailboxes` (purchased seats) | ✓ | | |
| **Create a new mailbox** | ✓ | | |
| Assign existing mailbox → user | ✓ | ✓ | |
| Suspend / delete mailbox | ✓ | request only | |
| Change mailbox quota | ✓ | request only | |
| Reset any password | ✓ | own tenant | own |
| Manage subscriptions | ✓ | view | |
| Edit branding | ✓ | ✓ (own tenant) | |
| Enable/disable plugins | ✓ | | |
| Configure plugins (allowed ones) | ✓ | ✓ | |
| Read platform audit | ✓ | own tenant only | own actions |
| Read notifications | all | own tenant | own |
| Read/send mail | | own mailbox | ✓ (own mailbox) |
| Signature · vacation · theme | | | ✓ |

Hard rule enforced in server-fn middleware **and** RLS:
`mailboxes.INSERT` requires `has_role(auth.uid(), 'super_admin', NULL)`. Company Admins never insert. When `assigned mailboxes >= licensed_mailboxes`, the "Assign mailbox" action returns `license.exceeded` with copy:

> *Mailbox limit reached. Contact Nyota One to purchase additional mailboxes.*

Company Admin can only **assign** an already-provisioned unassigned mailbox to a user, and only when a free one exists.

---

## 6. API Specification

Two surfaces (all Zod-validated, RFC 7807 errors).

### 6.1 Lovable server functions

Auth
- `auth.login`, `auth.logout`, `auth.me`, `auth.requestPasswordReset`, `auth.resetPassword`

Tenants (super admin)
- `tenants.list/create/update/suspend/resume`
- `tenants.assignMailServer({tenantId, mailServerId})`
- `tenants.setLicensedMailboxes({tenantId, count})`
- `tenants.rotatePleskKey`

Mail servers (super admin)
- `mailServers.list/create/update/disable`, `mailServers.testConnection`

Mailboxes
- `mailboxes.list({tenantId})` — super_admin all, company_admin own tenant
- `mailboxes.create({tenantId, email, displayName, quotaMb})` — **super_admin only**; refuses when licensed limit reached
- `mailboxes.assign({mailboxId, userId})` — super_admin + company_admin
- `mailboxes.unassign`, `mailboxes.suspend`, `mailboxes.delete` — super_admin
- `mailboxes.setQuota` — super_admin
- `mailboxes.summary({tenantId})` → `{licensed, assigned, available, storageUsedMb, storageQuotaMb}`
- `mailboxes.requestChange({...})` — company_admin submits a request; super_admin approves (audit-logged)

Users (company admin, tenant-scoped)
- `users.list/create/disable/assignRole/resetPassword`

Branding
- `branding.getByHost` (public), `branding.update`

Mail (proxy to gateway with per-request session creds)
- `mail.listFolders / listMessages / getMessage / send / move / delete / markRead / flag / attachment`

Preferences
- `me.updateSignature / updateVacation / updateTheme / updateLocale`

Audit
- `audit.list({filters})` — Super Admin: all; Company Admin: own tenant only. Read-only.

Notifications
- `notifications.list`, `notifications.markRead`, `notifications.markAllRead`
- `notifications.stream` (SSE) — future

Plugins
- `plugins.listCatalog` (super admin), `plugins.enableForTenant({tenantId, pluginId})`, `plugins.disableForTenant`, `plugins.configure({tenantId, pluginId, config})`

Onboarding (super admin driving new tenant)
- `onboarding.startTenant`, `onboarding.setDomain`, `onboarding.verifyDns`, `onboarding.verifySsl`, `onboarding.testImap`, `onboarding.testSmtp`, `onboarding.setBranding`, `onboarding.createFirstAdmin`, `onboarding.setLicensedMailboxes`, `onboarding.sendWelcome`, `onboarding.goLive`

Dashboard
- `dashboard.company({tenantId})` → aggregate stats (§10)
- `dashboard.platform()` — super admin

### 6.2 Mail Gateway HTTP API

Server-aware; each call names the `mailServerId` so the gateway routes to the right upstream. Auth via short-lived HMAC-signed JWT (`exp ≤ 60s`, `jti` replay cache).

```
POST /v1/imap/verify
POST /v1/imap/folders
POST /v1/imap/messages
POST /v1/imap/message
GET  /v1/imap/attachment
POST /v1/imap/flag | /move | /delete
POST /v1/smtp/send

POST /v1/plesk/mailbox.create   { mailServerId, domain, localPart, password, quotaMb }
POST /v1/plesk/mailbox.disable
POST /v1/plesk/mailbox.delete
POST /v1/plesk/mailbox.password
POST /v1/plesk/mailbox.quota
GET  /v1/plesk/mailbox.list?mailServerId=&domain=
GET  /v1/plesk/mailbox.usage?mailServerId=&domain=

# Onboarding
POST /v1/verify/dns
POST /v1/verify/ssl
POST /v1/verify/imap
POST /v1/verify/smtp
```

Error taxonomy: `imap.auth_failed`, `smtp.relay_denied`, `plesk.mailbox_exists`, `plesk.quota_exceeded`, `license.exceeded`, `server.unreachable`, `dns.not_pointing`, `ssl.not_issued`.

---

## 7. Authentication Flow

```text
1. POST /login (email, password) at inbox.acme.com
2. Middleware: Host → tenant → server. Reject if suspended.
3. auth.login:
     a. Look up user + assigned mailbox in DB.
     b. Mint 60s HMAC token, call gateway /v1/imap/verify.
     c. On success:
         - allocate cookie_id (random 32B)
         - derive session_key = HKDF(server_master, cookie_id)
         - encrypt {email, password} with AES-256-GCM(session_key)
         - insert sessions row with enc_creds, iv, tag, TTL
         - set HttpOnly Secure SameSite=Lax cookie: nyota_sid=<cookie_id>
4. Every mail request:
     - read cookie_id → derive key → decrypt enc_creds in memory
     - forward creds in HMAC-signed call to gateway
     - drop creds after response
5. Idle expiry (12h) or absolute expiry (24h) → session hard-deleted.
6. Logout / disable / tenant suspend → sessions.revoked_at set + row wiped.
7. Password reset: /reset-password (public) → gateway → Plesk mailbox.password.
```

No mail password ever leaves memory except as ciphertext in the `sessions` row, and only for that session's TTL.

---

## 8. Plesk Abstraction Strategy

Plesk is **never** exposed to end users, Company Admins, or the browser.

- Only the **Mail Gateway** speaks Plesk. All app calls go through the gateway API in §6.2.
- Preferred channels: **REST API** → **XML-API** → **`plesk` CLI over SSH** (in that order).
- Never touch Plesk MySQL directly.
- Per-server credentials in secrets manager (`mail_servers.plesk_auth_ref` is a reference id).
- The gateway performs a reconciliation sweep per tenant (nightly): compare `mailboxes` to `plesk.mailbox.list` — drift raises a `notifications` entry for Super Admin and an `audit_logs` row.
- Multi-server: each `mailServerId` maps to its own Plesk endpoint. Tenants move between servers via `tenants.assignMailServer` + a gateway-run migration (out of scope for v1, hooks reserved).

---

## 9. Security Architecture

- **No stored mail passwords.** See §2 and §7.
- **Sessions** encrypted server-side; only opaque cookie id on the client.
- **Transport**: TLS everywhere, HSTS on custom domains.
- **Gateway auth**: HMAC-signed JWT, `exp ≤ 60s`, replay-cached by `jti`.
- **CSRF**: TanStack `createCsrfMiddleware` on all server functions.
- **RBAC**: UI hide → server-fn `requireRole` → RLS. Three layers.
- **RLS**: `has_role(auth.uid(), role, tenant_id)` SECURITY DEFINER everywhere; separate `user_roles` table.
- **Grants**: explicit per-table `GRANT` to `authenticated` / `service_role`.
- **Rate limiting**: `/login`, `/reset-password`, gateway verify endpoints — token bucket at the edge; failed logins trigger notification.
- **SSRF**: Plesk endpoints allowlisted (`https://` + fixed ports); DNS-rebinding-safe fetch.
- **Content isolation**: no email content in DB, logs, or telemetry. Gateway logs redact bodies/headers except `Message-Id`, `Date`, size.
- **Audit immutability**: `audit_logs` grants only `INSERT` + `SELECT` to `authenticated`; no `UPDATE`/`DELETE` to any role. Nightly hash-chain verifier (`row_hash = sha256(prev_hash || row_payload)`) alerts on breaks. Even service_role is restricted via policy trigger that rejects UPDATE/DELETE.
- **Least-privilege secrets**: Plesk tokens, session master key, gateway HMAC secrets — all in secrets manager, referenced by id.

---

## 10. Company & Platform Dashboards

### Company Dashboard (`/settings/company` home)

Cards:
- **Licensed mailboxes** (purchased)
- **Assigned mailboxes**
- **Available mailboxes** (with CTA disabled + "Contact Nyota One" copy when 0)
- **Total storage** (sum of quotas)
- **Storage used** (live from Plesk via gateway)
- **Top 5 largest mailboxes** (table: email, used / quota, %)
- **Recent logins** (last 20: user, ip, ua, ts) — from `audit_logs`
- **Recent activity** (last 20: any tenant-scoped audit event)

### Platform Dashboard (`/settings/admin`)

- Tenants: count by status, seats used vs licensed
- Per-server capacity + utilization
- Failed-login trend
- Notifications feed
- Subscription renewals due in 30 days

---

## 11. Notification Center

- Server-generated `notifications` rows; audience = `super_admin` (platform-level) or `company_admin` (tenant-level).
- Bell icon in header with unread count; drawer lists items grouped by severity.
- Triggers:
  - Subscription expiry (30/7/1 day)
  - Quota warning (mailbox ≥ 80% / 95% used)
  - Failed logins (≥ N in window per tenant/user)
  - Storage nearing capacity (tenant total)
  - SSL expiry (30/7 day)
  - Domain verification status change
  - System maintenance windows
  - Backup status (success/failure)
  - Plesk reconciliation drift
- Delivery channels: in-app now; email + webhook reserved (plugin-driven later).

---

## 12. Audit Logging

Every entry: `actor_user_id`, `actor_role`, `tenant_id`, `action`, `target_type/id`, `previous_value`, `new_value`, `ip`, `user_agent`, `created_at`, hash-chain fields.

Actions covered (minimum): `login`, `logout`, `login_failed`, `password_reset_requested`, `password_reset_completed`, `mailbox_created`, `mailbox_updated`, `mailbox_deleted`, `mailbox_quota_changed`, `branding_updated`, `tenant_created/suspended/resumed`, `role_assigned/revoked`, `license_changed`, `subscription_updated`, `server_assigned`, `plugin_enabled/disabled`.

Immutability enforced by grants + policy trigger; verified nightly by hash-chain check (raises `notifications` on break).

---

## 13. Customer Onboarding Wizard

Wizard state lives on `tenants.onboarding_state` + `domain_verifications`. Only Super Admin drives it.

Steps (each is resumable, produces an audit entry):

1. **Company Details** — name, slug, contact.
2. **Domain** — enter primary domain; system computes `inbox.<domain>` and CNAME target.
3. **DNS Verification** — TXT + CNAME check via gateway.
4. **SSL Verification** — Lovable custom-domain SSL check.
5. **IMAP Test** — sample credentials tested against assigned `mail_server`.
6. **SMTP Test** — send probe.
7. **Company Branding** — logo, favicon, colors, fonts, welcome bg.
8. **Company Admin** — first admin user (invite email w/ reset token).
9. **Licensed Mailboxes** — Super Admin sets purchased count.
10. **Welcome Email** — sent via gateway from a Nyota system address.
11. **Go Live** — `tenants.status='active'`.

UI: left rail step tracker, right pane current step, "resume later" persists state.

---

## 14. White-Label Support

Per-tenant, driven by `tenant_branding`:
- logo, favicon, login background image
- primary / secondary / accent colors (oklch)
- display + body font families (from an allowlist or self-hosted asset)
- company name, welcome message, support email
- default theme (light/dark/system) — user preference overrides

Implementation: `BrandProvider` loads branding via `branding.getByHost` (cached), injects CSS variables and `<link rel="preload">` for fonts, sets `<title>` and favicon. All components use semantic tokens exclusively — no hardcoded colors — so switching tenants re-skins everything.

Nyota product chrome (badges, footer credits) is hidden per tenant plan flag.

---

## 15. Folder Structure

```text
src/
  routes/
    __root.tsx
    index.tsx                    hostname-aware landing
    login.tsx
    reset-password.tsx
    suspended.tsx
    _authenticated/
      route.tsx                  session + tenant gate
      mail/{index,$folder,$folder.$uid,compose}.tsx
      settings/
        profile.tsx
        company.tsx              dashboard + users + branding + mailbox requests
        admin.tsx                super admin console
        onboarding.$tenantId.tsx wizard
      notifications.tsx
    api/
      public/{health,webhook.plesk}.ts
      mail/attachment.$uid.ts
  lib/
    tenant.ts                    host → tenant + mail_server
    branding.ts
    session.ts                   encrypted server session helpers
    crypto.ts                    AES-GCM + HKDF (edge-safe)
    gateway-client.ts
    auth.functions.ts
    tenants.functions.ts
    mail-servers.functions.ts
    mailboxes.functions.ts
    users.functions.ts
    branding.functions.ts
    mail.functions.ts
    audit.functions.ts
    notifications.functions.ts
    plugins.functions.ts
    onboarding.functions.ts
    dashboard.functions.ts
  components/
    mail/    branding/    admin/    onboarding/    notifications/    ui/
  modules/                       plugin implementations
    contacts/   calendar/   tasks/   ai/   guard/   shared-mailboxes/
    reports/    billing/
    _framework/ manifest.ts, loader.ts, registry.ts
  styles.css

mail-gateway/                    separate deployable (Node)
  src/routes/{imap,smtp,plesk,verify}.*
  src/lib/{imap-pool,smtp,plesk-rest,plesk-cli,auth,reconcile}.ts
  Dockerfile
```

Every server-fn file is a thin wrapper; logic lives in `*.server.ts` or the gateway.

---

## 16. Plugin Framework

Every non-core capability ships as a **plugin** with a static manifest — no core changes needed to enable one.

Manifest contract:

```ts
export const manifest: PluginManifest = {
  id: 'contacts',
  name: 'Contacts',
  version: '1.0.0',
  icon: 'users',
  requiredRole: 'user',
  featureFlag: 'contacts',
  routes: [{ path: '/contacts', role: 'user' }],
  serverFunctions: () => import('./functions'),
  migrations: () => import('./db/migrations'),
  navEntry: { label: 'Contacts', path: '/contacts' },
  permissions: ['contacts:read', 'contacts:write'],
  gatewayHooks: ['beforeMessage'], // optional
};
```

Runtime:
- `plugins` registry table lists installable plugins; `tenant_plugins` toggles per tenant.
- App boot scans `src/modules/*/manifest.ts`, registers routes under `_authenticated/`, and shows nav entries only when: plugin exists in registry, `tenant_plugins.enabled=true`, and user role satisfies `requiredRole`.
- Each plugin owns its tables and RLS. Cross-plugin data flows through documented server functions.
- Gateway-side plugins register signed hook implementations (e.g. Nyota Email Guard's `beforeMessage` scan). Verdict + metadata cached in plugin tables — never raw content.

Core module slots reserved now: **Mail (core)**, **Contacts**, **Calendar**, **Tasks**, **AI Assistant**, **Nyota Email Guard**, **Shared Mailboxes**, **Reports**, **Billing**.

---

## 17. UI Navigation Map

```text
inbox.<tenant>.<tld>
├── /                             redirect: authed → /mail else /login
├── /login                        branded
├── /reset-password?token=…
├── /suspended
└── /_authenticated               (session + tenant gate)
    ├── /mail
    │   ├── /mail/$folder
    │   ├── /mail/$folder/$uid
    │   └── /mail/compose
    ├── /notifications
    ├── /settings
    │   ├── /settings/profile
    │   ├── /settings/company         Dashboard · Users · Branding · Mailboxes (view + assign + request) · Plugins (configure)
    │   └── /settings/admin           Platform dash · Tenants · Mail servers · Licensing · Subscriptions · Plugins (enable) · Audit
    │       └── /settings/admin/onboarding/$tenantId   11-step wizard
    └── /help
```

Layouts: three-pane desktop, two-pane tablet, single-pane mobile with FAB compose. All chrome themed per tenant.

---

## 18. Deployment Architecture

```text
Cloudflare (Lovable-managed)
  ├── Edge Workers               App (SSR + server fns)
  ├── R2                         static/branding assets
  └── Custom domains + SSL       per-tenant inbox.<company>.<tld>

Lovable Cloud
  └── Postgres (Supabase)        + PITR backups, secrets manager

Nyota-managed
  └── Mail Gateway fleet (Node, Docker)
        - Deployed once per region OR per Plesk cluster
        - Stateless, horizontal, blue/green
        - HMAC auth · IP allowlist per Plesk server
        - Reads mail_servers config from app via signed callback

Customer Plesk servers (many, unmodified)
  server-a.plesk … server-N.plesk
```

Envs: dev / preview / prod, each with its own secrets, gateway URL(s), DB, and mail-server registry. Zero email data persisted in any env. Observability: redacted request logs, server-fn traces, gateway Prom metrics (`imap_ops_total`, `plesk_calls_total`, latency), Postgres slow-query alerts. CI: forward-only migrations gated before app deploy; gateway image versioned and rolled independently.

---

## 19. Milestones (post-approval, small & testable)

1. **Foundation** — Lovable Cloud, schema (tenants, mail_servers, users, user_roles, mailboxes, sessions, audit_logs, notifications, plugins, tenant_plugins, tenant_branding, subscriptions, domain_verifications), RLS, grants, hash-chain audit, design tokens.
2. **Session + Auth** — encrypted server session, login/logout, password reset, `_authenticated` gate, sign-in affordance.
3. **Mail Gateway contract + mock** — HTTP spec frozen; mock gateway ships so app is testable.
4. **Mailboxes & Licensing** — mailboxes CRUD (Super Admin only for create/quota), assign flow for Company Admin, "limit reached" copy, dashboard summary.
5. **Webmail UI** — folders, list, view, compose, search, attachments.
6. **Preferences** — signature, vacation, theme, locale.
7. **Company Admin console** — users, branding editor, dashboard, mailbox requests.
8. **Super Admin console** — tenants, mail_servers, subscriptions, licenses, audit viewer.
9. **Onboarding wizard** — 11 steps with resume.
10. **Notification center** — feed + generators for the listed triggers.
11. **Plugin framework** — manifest loader, registry, tenant toggles; scaffold Contacts as first plugin.
12. **Polish + a11y + mobile**, then reserved plugin slots (Calendar, Tasks, AI, Guard, Shared Mailboxes, Reports, Billing).

---

## 20. Open Decisions

1. **Session TTL** — 12h idle / 24h absolute OK, or longer?
2. **Mail Gateway ownership** — greenfield reference implementation from us, or existing infra?
3. **Failed-login threshold + lockout policy** — proposed 5 in 15 min → notify + soft-lock 15 min. Confirm.
4. **Nyota One official palette + fonts** — confirm oklch values and font pair.
5. **Custom-domain flow** — CNAME to Lovable apex (recommended) vs. A-record.
6. **Plesk versions in scope** — drives REST vs. XML-API vs. CLI mix.
7. **Multi-server v1 posture** — single production Plesk at launch with schema/hooks already multi-server, or launch with two servers to prove routing?

Approve or amend, and I'll begin Milestone 1.
