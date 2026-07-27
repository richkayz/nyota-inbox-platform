
# Nyota Inbox — Technical Architecture Blueprint

A multi-tenant, branded webmail platform that connects to existing **Plesk** mail servers over IMAP/SMTP. Email content is **never persisted** — only application metadata (tenants, users, branding, roles, audit) lives in our database. This document is the blueprint; implementation follows in phased milestones.

---

## 1. Overall System Architecture

```text
                    ┌──────────────────────────────────────┐
   Browser (SPA) ──►│  Lovable App  (TanStack Start)       │
   inbox.acme.com   │  - SSR + React 19                    │
                    │  - Server functions (Workers)        │
                    │  - Tenant resolver (Host header)     │
                    │  - Auth, RBAC, branding, quotas      │
                    └───────┬───────────────────┬──────────┘
                            │                   │
                 signed HMAC│token              │Postgres over TLS
                            ▼                   ▼
                 ┌────────────────────┐  ┌──────────────────────┐
                 │  Mail Gateway      │  │ Lovable Cloud (PG)   │
                 │  (Node service)    │  │ tenants, users,      │
                 │  - imapflow        │  │ user_roles, branding,│
                 │  - nodemailer      │  │ subscriptions, audit │
                 │  - Plesk REST/CLI  │  │ + RLS everywhere     │
                 │  - Stateless       │  └──────────────────────┘
                 └───┬───────────┬────┘
                     │ IMAP/SMTP │ HTTPS (Plesk XML-API / REST / CLI)
                     ▼           ▼
              ┌────────────────────────────┐
              │  Plesk Mail Server(s)      │
              │  Dovecot · Postfix · Plesk │
              └────────────────────────────┘
```

Three tiers with strict responsibilities:

- **Lovable App (edge, Cloudflare Workers)** — UI, auth session, RBAC, multi-tenant routing, admin operations. Never speaks IMAP/SMTP/Plesk directly.
- **Mail Gateway (Node service, self-hosted alongside Plesk)** — the *only* component allowed to open raw sockets or reach Plesk. Stateless, per-request credentials.
- **Postgres (Lovable Cloud / Supabase)** — application metadata + RLS. Zero email content.

Why the gateway exists: Workers cannot open raw TCP → no `node-imap`/`nodemailer`. Plesk XML-API/CLI also assume a trusted network. The gateway is the trust and protocol boundary.

---

## 2. Database Schema

All tables live in `public`, all are RLS-enabled, all writes go through server functions. Roles are **never** stored on the users table.

```text
-- Enums
app_role                 ENUM(super_admin, company_admin, user)
tenant_status            ENUM(active, suspended, provisioning)
subscription_status      ENUM(trial, active, past_due, canceled)

-- Core
tenants(
  id uuid pk, name, slug unique,
  custom_domain citext unique,           -- inbox.acme.com
  status tenant_status,
  plesk_endpoint text,                   -- https://plesk.acme.com:8443
  plesk_auth_ref text,                   -- reference to secret, not the secret
  imap_host, imap_port, imap_tls bool,
  smtp_host, smtp_port, smtp_tls bool,
  licensed_mailboxes int,
  feature_flags jsonb default '{}',      -- contacts, calendar, ai, guard...
  created_at, updated_at)

tenant_branding(
  tenant_id pk fk→tenants,
  logo_url, favicon_url, login_bg_url,
  primary_color, secondary_color, accent_color,   -- oklch strings
  welcome_message text,
  theme_default ENUM(light, dark, system),
  support_email)

subscriptions(
  id, tenant_id fk, plan, seats,
  renews_at, status subscription_status,
  external_ref text)                     -- Stripe/Paddle id later

users(
  id uuid pk, tenant_id fk,
  email citext, display_name,
  encrypted_mail_password bytea,         -- AES-256-GCM, per-tenant DEK
  mail_password_iv bytea, mail_password_tag bytea,
  enabled bool default true,
  vacation_enabled bool, vacation_message text,
  signature_html text,
  theme_preference ENUM(light, dark, system),
  locale text, last_login_at,
  created_at, updated_at,
  UNIQUE(tenant_id, email))

user_roles(                              -- SEPARATE table, mandatory
  id, user_id fk, tenant_id fk,
  role app_role,
  UNIQUE(user_id, role, tenant_id))

sessions(
  id uuid pk, user_id fk, tenant_id fk,
  refresh_token_hash, user_agent, ip,
  created_at, last_seen_at, revoked_at, expires_at)

password_reset_tokens(
  id, user_id fk, token_hash, expires_at, used_at)

audit_log(
  id, tenant_id, actor_user_id, action text,
  target_type, target_id, meta jsonb, ip, created_at)

api_keys(                                -- Mail Gateway auth
  id, tenant_id fk, key_hash, label,
  scopes text[], expires_at, revoked_at)

-- Reserved namespaces (created empty later, feature-flagged)
contacts, contact_groups
calendars, calendar_events
tasks
ai_threads, ai_messages
shared_mailboxes, shared_mailbox_members
guard_scans                              -- Nyota Email Guard results cache
```

Security helper (mandatory pattern):

```sql
create function public.has_role(_user uuid, _role app_role, _tenant uuid)
returns boolean language sql stable security definer set search_path=public as $$
  select exists (select 1 from user_roles
                 where user_id=_user and role=_role and tenant_id=_tenant)
$$;
```

Every RLS policy uses `has_role(auth.uid(), 'x', tenant_id)`. Every `CREATE TABLE` is followed by explicit `GRANT`s to `authenticated` / `service_role`.

---

## 3. Multi-Tenant Design

- **Tenant identity = hostname.** `Host` header → `tenants.custom_domain` → `tenant_id`. Resolved in a request middleware and put on the request context; every server function reads it from context, never from client input.
- **Isolation model:** shared database, shared schema, **row-level tenancy** enforced by RLS (`tenant_id = current_tenant()`), plus an app-level guard in every server function. Two independent checks.
- **Custom domain onboarding:** tenant adds `CNAME inbox → <lovable-managed-apex>`; Lovable custom-domain flow issues SSL. `tenants.custom_domain` is unique.
- **Fallback host:** `<slug>.nyota.one` always works even before the tenant configures a CNAME.
- **Suspension:** `tenants.status = suspended` → middleware short-circuits into a branded suspension page; existing sessions are revoked.
- **Per-tenant secrets:** Plesk credentials, encryption DEK, SMTP overrides — stored as secret references, never in plain columns.

---

## 4. User Roles & Permissions

Three roles, stored only in `user_roles`.

| Capability | Super Admin | Company Admin | User |
|---|---|---|---|
| Create / suspend tenants | ✓ | | |
| Configure Plesk endpoint & keys | ✓ | | |
| Manage subscriptions & seat limits | ✓ | view | |
| Platform analytics | ✓ | | |
| Global password reset | ✓ | own tenant | own |
| Create / disable users (within seat limit) | ✓ | ✓ | |
| Assign roles (never `super_admin`) | ✓ | within tenant | |
| Edit branding | ✓ | ✓ | |
| Read / send mail | | own mailbox | ✓ |
| Signature · vacation · theme | | | ✓ |
| Feature flags per tenant | ✓ | view | |

Enforcement is layered: **UI hide → server-fn middleware `requireRole()` → RLS policy**. UI hiding is cosmetic; the two server-side checks are the actual security boundary.

---

## 5. API Specification

Two surfaces: **Lovable server functions** (browser → app) and **Mail Gateway HTTP API** (app → gateway). All payloads Zod-validated.

### 5.1 Lovable server functions (client-facing)

Auth
- `auth.login({email, password})` — resolves tenant from Host, calls `gateway.imapVerify`, mints session cookie.
- `auth.logout()`, `auth.me()`, `auth.requestPasswordReset({email})`, `auth.resetPassword({token, newPassword})`.

Tenants (super admin)
- `tenants.list`, `tenants.create`, `tenants.update`, `tenants.suspend`, `tenants.setSeats`, `tenants.rotatePleskKey`.

Users (company admin, scoped by tenant)
- `users.list`, `users.create`, `users.disable`, `users.assignRole`, `users.resetPassword`.

Branding
- `branding.getByHost` (public, cached), `branding.update`.

Mail (all proxy to gateway; server fn attaches signed HMAC token)
- `mail.listFolders`, `mail.listMessages({folder, page, search, filter})`
- `mail.getMessage({folder, uid})`, `mail.sendMessage(mime|structured)`
- `mail.move`, `mail.delete`, `mail.markRead`, `mail.flag`
- `mail.attachment({uid, partId})` — streamed via `/api/mail/attachment/*`

Preferences
- `me.updateSignature`, `me.updateVacation`, `me.updateTheme`, `me.updateLocale`.

Feature flags (super admin)
- `features.set({tenantId, flag, enabled})`.

### 5.2 Mail Gateway HTTP API (internal)

All requests carry `Authorization: Bearer <HMAC-signed short-lived JWT>` minted by Lovable (`iss=lovable-app`, `sub=user_id`, `tid=tenant_id`, `exp<=60s`). Gateway validates against a per-tenant shared secret.

```
POST /v1/imap/verify           { host, port, user, password } → { ok, capabilities }
POST /v1/imap/folders          { creds } → [{ name, path, unseen, total }]
POST /v1/imap/messages         { creds, folder, page, pageSize, query } → { items[], nextPage }
POST /v1/imap/message          { creds, folder, uid } → { headers, body, parts[] }
GET  /v1/imap/attachment       ?uid=&partId=  → binary stream
POST /v1/imap/flag             { creds, uid, flag, value }
POST /v1/imap/move             { creds, uid, from, to }
POST /v1/imap/delete           { creds, uid, folder }
POST /v1/smtp/send             { creds, message, appendToSent:true }

# Plesk provisioning (super_admin scope)
POST /v1/plesk/mailbox.create  { domain, localPart, password, quotaMb }
POST /v1/plesk/mailbox.disable { domain, localPart }
POST /v1/plesk/mailbox.password{ domain, localPart, newPassword }
GET  /v1/plesk/mailbox.list    ?domain=
```

Errors: RFC 7807 problem+json; gateway maps IMAP/SMTP/Plesk failures to stable codes (`imap.auth_failed`, `plesk.mailbox_exists`, `quota.exceeded`, ...).

---

## 6. Authentication Flow

Single credential: the user's **mail-server password**. The app has no separate password store.

```text
1. Browser POSTs /login (email, password) to inbox.acme.com.
2. App middleware: Host → tenant. Reject if suspended.
3. auth.login server fn:
     a. Mints short-lived HMAC token (tid, uid-placeholder, exp=60s).
     b. Calls gateway /v1/imap/verify with tenant's imap host + user creds.
     c. On success: upserts users row, records last_login_at,
        encrypts mail password (AES-256-GCM, tenant DEK) if "remember" mode,
        creates sessions row.
4. Sets HttpOnly, Secure, SameSite=Lax cookie:
     nyota_sid = <opaque> mapped to sessions.id
5. Subsequent requests: cookie → session → user → tenant (must match Host).
6. Refresh: sliding expiry via rotate on activity; hard cap 30 days.
7. Password reset:
     - Only when tenant enabled "app-managed reset" (requires Plesk creds).
     - Token emailed, /reset-password page (public route) calls
       gateway /v1/plesk/mailbox.password.
8. Logout: revoke session row; clear cookie.
```

Two credential-handling modes, chosen per tenant:

- **Session-scoped (default, safest):** mail password kept only in the encrypted session record for the duration of the session, wiped on logout. Re-prompt on expiry.
- **Encrypted at rest:** allows background operations (vacation autoresponder toggling, IMAP IDLE workers). Uses per-tenant DEK wrapped by a KEK stored in secrets manager.

CSRF: the existing TanStack `createCsrfMiddleware` on server functions. Cookies are `SameSite=Lax`; state-changing calls also require CSRF token.

---

## 7. Plesk Integration Strategy

**Never touch the Plesk MySQL database directly.** Two supported channels, in order of preference:

1. **Plesk REST API** (`/api/v2`, token auth) — modern, JSON, primary path.
2. **Plesk XML-API** (`/enterprise/control/agent.php`) — fallback for older Plesk versions.
3. **`plesk` CLI over SSH** — last resort for operations REST doesn't cover, wrapped by the Mail Gateway with a restricted shell user.

Operations we perform through Plesk:
- Create / disable / delete mailbox.
- Set / reset mailbox password.
- Set quota, autoresponder, forwarding.
- List mailboxes for a domain (used to reconcile seat counts).

Credentials:
- Per-tenant Plesk API token stored in secrets manager, referenced by `tenants.plesk_auth_ref`.
- Rotated via `tenants.rotatePleskKey` (super admin).
- Requests from Lovable app carry a signed instruction; the gateway resolves the token locally so it never crosses the public internet from the app.

Reconciliation job (future): nightly compare `users` ↔ `plesk.mailbox.list` per tenant, flag drift in audit log.

---

## 8. Folder Structure

```text
src/
  routes/
    __root.tsx
    index.tsx                     hostname-aware landing → /login or /mail
    login.tsx
    reset-password.tsx
    suspended.tsx
    _authenticated/
      route.tsx                   auth + tenant gate (beforeLoad)
      mail/
        index.tsx                 inbox
        $folder.tsx
        $folder.$uid.tsx
        compose.tsx
      settings/
        profile.tsx               (signature, vacation, theme, locale)
        company.tsx               (company_admin: users, branding, seats)
        admin.tsx                 (super_admin: tenants, subs, flags)
    api/
      public/
        health.ts
        webhook.plesk.ts          (future — inbound Plesk events)
      mail/
        attachment.$uid.ts        streams gateway attachment
  lib/
    tenant.ts                     Host → tenant resolver
    branding.ts                   CSS var + head injector
    crypto.ts                     AES-GCM helpers (edge-safe)
    gateway-client.ts             typed client for Mail Gateway
    auth.functions.ts
    tenants.functions.ts
    users.functions.ts
    branding.functions.ts
    mail.functions.ts
    features.functions.ts
  components/
    mail/       Sidebar, MessageList, MessageView, Composer, SearchBar
    branding/   BrandProvider, Logo, SuspendedScreen
    admin/      TenantTable, UserTable, BrandingEditor, SeatMeter
    ui/         shadcn primitives
  modules/                        feature-flagged, added later
    contacts/  calendar/  tasks/  ai/  guard/  shared-mailboxes/
  styles.css

mail-gateway/                     separate deployable
  src/
    routes/imap.*  smtp.*  plesk.*
    lib/imap-pool.ts  smtp.ts  plesk-rest.ts  plesk-cli.ts
    lib/auth.ts    (HMAC token verify)
  package.json  Dockerfile
```

Rules: every server-function file is a thin wrapper (imports + `.functions.ts` exports only, per TanStack constraints). Business logic lives in `lib/*.server.ts` or the gateway.

---

## 9. Security Architecture

Defence in depth:

- **Transport:** TLS everywhere. HSTS on custom domains. Mail Gateway only reachable over HTTPS.
- **App→Gateway auth:** short-lived HMAC-signed JWT (`exp≤60s`, per-tenant secret), replay-protected by `jti` cache in gateway (60s TTL).
- **Cookies:** `HttpOnly`, `Secure`, `SameSite=Lax`; opaque session id, not a JWT.
- **CSRF:** `createCsrfMiddleware` on all server functions; state-changing requests require CSRF token.
- **RBAC:** three-layer — UI, server-fn `requireRole`, RLS policies. Any single layer failing does not open access.
- **RLS:** every tenant-scoped table; policies use `has_role(auth.uid(), role, tenant_id)` SECURITY DEFINER.
- **Grants:** explicit per-table `GRANT` to `authenticated`, no default schema privileges.
- **Secrets:** Plesk tokens, DEKs, gateway HMAC secrets stored via secrets manager, referenced by id.
- **Encryption at rest:** mail passwords AES-256-GCM with per-tenant DEK, KEK held by secrets manager. `iv` + `tag` stored alongside ciphertext.
- **Password reset tokens:** stored hashed (SHA-256), single-use, 30-min expiry.
- **Rate limiting:** per-IP + per-tenant on `/login`, `/reset-password`, gateway auth endpoints (token bucket at the edge).
- **Audit:** every privileged action → `audit_log` (actor, target, meta, ip). Append-only, no client-side writes.
- **Session revocation:** suspending a tenant or disabling a user marks `sessions.revoked_at`; middleware checks per request.
- **Content isolation:** no email content ever hits our DB, logs, or observability stack. Gateway logs redact bodies and headers except `Message-Id`, `Date`, size.
- **Attachment streaming:** flows through app as pass-through; no disk buffering.
- **Nyota Email Guard hook (future):** on-fetch scan runs inside gateway; only verdict + metadata cached in `guard_scans`.

Threats explicitly considered:
- Cross-tenant data access → RLS + Host binding.
- Credential theft → session-scoped mode + rotate on logout + short refresh window.
- SSRF from admin-editable Plesk endpoint → allowlist scheme=https, port in {8443, 443}, DNS-rebinding-safe fetch.
- Privilege escalation via role tampering → roles only writable by `super_admin` (RLS); UI never sends role fields.

---

## 10. UI Navigation Map

```text
inbox.<tenant>.com
├── /                        redirect: authed → /mail, else → /login
├── /login                   branded login (logo, welcome, bg)
├── /reset-password?token=…  public
├── /suspended               branded suspension screen
└── /_authenticated          (gate: session + tenant match)
    ├── /mail                inbox (default folder)
    │   ├── /mail/$folder    Sent, Drafts, Spam, Trash, custom
    │   ├── /mail/$folder/$uid   message view
    │   └── /mail/compose        slide-over / full-screen on mobile
    ├── /settings
    │   ├── /settings/profile    signature · vacation · theme · locale · password
    │   ├── /settings/company    [company_admin] users, branding, seats, domain
    │   └── /settings/admin      [super_admin] tenants, subs, flags, audit
    └── /help                    tenant.supportEmail, docs
```

Layout shells:
- **Desktop:** three-pane mail (sidebar · list · reading pane).
- **Tablet:** two-pane collapsible.
- **Mobile:** single-pane stack with back-nav; FAB for compose; bottom sheet for filters.

Global chrome: brand logo (left), search (center), theme toggle + avatar menu (right). Admin surfaces reuse the same shell with a scoped sidebar.

---

## 11. Deployment Architecture

```text
Cloudflare (Lovable-managed)
  ├── Edge Workers                Lovable App (SSR + server fns)
  ├── R2                          static assets, logos, favicons
  └── Custom domains + SSL        per-tenant inbox.<company>.<tld>

Lovable Cloud
  └── Postgres (Supabase)         primary + PITR backups

Customer / Nyota-managed infra
  └── Mail Gateway (Node)         Fly.io region near Plesk, or VM in Plesk network
        ├── /v1/imap/*  /smtp/*
        ├── /v1/plesk/*
        └── HMAC auth · rate limit · IP allowlist

Existing Plesk servers                unchanged
```

Environments: **dev**, **preview** (per branch), **prod**. Each has its own secrets, gateway URL, and DB. Zero email data persisted in any environment.

Observability:
- App: request logs (redacted), server-fn traces, error reporting.
- Gateway: structured logs (no bodies), Prom metrics (`imap_ops_total`, `plesk_calls_total`, latency histograms), health endpoint.
- DB: Supabase logs + slow-query alerting.

CI/CD:
- App: Lovable-managed deploy on merge.
- Gateway: separate repo/pipeline (Docker image, versioned, blue-green on Fly).
- DB migrations: forward-only, reviewed, applied via CI before app deploy.

Scaling: Workers are horizontal; gateway is horizontal + stateless (IMAP pooling per instance); Postgres vertical + read replicas when needed.

---

## 12. Future Plugin / Module Architecture

Each future capability is a **module** under `src/modules/<name>/` plus optional `mail-gateway/plugins/<name>/`.

Contract per module:
```text
modules/<name>/
  manifest.ts        id, title, icon, routes[], requiredRole, featureFlag
  routes/*           TanStack routes registered under /_authenticated
  functions/*        server functions (own namespace)
  db/                migrations (own tables, own RLS)
  ui/                components, own nav entry
  gateway.ts         optional: typed client for gateway plugin
```

- **Discovery:** modules register via a static manifest imported by `_authenticated/route.tsx`; navigation entries appear only when `tenants.feature_flags[<name>] === true` **and** the user's role passes `requiredRole`.
- **Isolation:** each module owns its tables and RLS. No module reads another module's tables directly — cross-module needs go through a documented server function.
- **Gateway plugins:** modules that need mail-side hooks (e.g. Nyota Email Guard scanning on fetch) register a gateway plugin exposing `beforeMessage`, `afterSend`, etc. Gateway loads plugins from a signed manifest.
- **Feature flags:** stored on `tenants.feature_flags`; toggled by super_admin; UI reflects immediately.
- **Roadmap slots:** Contacts, Calendar, Tasks, AI Assistant, Nyota Email Guard, Shared Mailboxes, Rules/Filters, Mobile PWA push.

---

## Open Decisions (needed to start Phase 1 build)

1. Mail Gateway — greenfield reference implementation from us, or existing infra?
2. Password handling default: session-scoped vs. encrypted-at-rest?
3. Nyota One official palette (exact oklch values) — confirm defaults or supply brand tokens.
4. Custom-domain flow: CNAME to Lovable apex (recommended) vs. A-record.
5. Plesk versions in scope (drives REST vs. XML-API vs. CLI mix).

Approve this blueprint (or amend the sections you want changed) and I will begin Phase 1: Foundation — schema, RLS, hostname resolver, branding pipeline, and the design system — with the Mail Gateway spec locked as the contract for Phase 3.
