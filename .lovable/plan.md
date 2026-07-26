
# Nyota Inbox — Architecture & Implementation Plan

A multi-tenant webmail platform (React + TS + Tailwind on this stack; TanStack Start server functions for backend) that connects to existing Plesk mail servers via IMAP/SMTP. Emails are never persisted — only app metadata lives in Postgres (Lovable Cloud / Supabase).

> Stack note: this Lovable project uses TanStack Start (React + Vite) with server functions on Cloudflare Workers. IMAP/SMTP require raw TCP + native Node libraries (`node-imap`, `nodemailer`) which do NOT run on Workers. The mail-protocol layer must run on a small external Node service (a "Mail Gateway"). The Lovable app talks to it over HTTPS. This is called out in "Deployment topology" below.

---

## 1. High-level architecture

```text
   Browser (React SPA/SSR - TanStack Start)
        │  HTTPS (session cookie)
        ▼
   Lovable App  (TanStack server fns + /api routes)
        │  - Auth, tenants, branding, roles, quotas
        │  - Signed short-lived JWT ──────────────┐
        ▼                                          ▼
   Postgres (Supabase)                    Mail Gateway (Node)
   - tenants, users, roles                 - IMAP (Dovecot)
   - branding, signatures                  - SMTP (Postfix)
   - subscriptions, audit                  - Per-request creds
                                           - No storage
                                                 │
                                                 ▼
                                          Plesk mail server(s)
```

- Emails are fetched live from IMAP on every request; short in-memory cache in Mail Gateway only (per connection).
- Credentials: user's mail password is stored encrypted (AES-256-GCM) in Postgres, decrypted server-side per request. Alternative: keep only session-scoped, re-prompt on expiry. Recommend encrypted-at-rest with per-tenant key.

## 2. Multi-tenant model

- Tenant = Company. Resolved by **hostname** (`inbox.company.com`).
- `tenants.custom_domain` unique. A middleware on every request resolves `Host` → `tenant_id` → attaches to context.
- Wildcard cert via Lovable custom domains (each company adds a CNAME to their `inbox.` subdomain).
- Row-Level Security in Postgres keys everything by `tenant_id`.

## 3. Database schema (Postgres)

```text
tenants
  id, name, slug, custom_domain (unique), status(active|suspended),
  licensed_mailboxes int, mail_server_host, imap_host, imap_port,
  smtp_host, smtp_port, created_at

tenant_branding
  tenant_id (pk/fk), logo_url, favicon_url, login_bg_url,
  primary_color, secondary_color, accent_color,
  welcome_message, theme_default(light|dark)

subscriptions
  id, tenant_id, plan, seats, renews_at, status

users
  id, tenant_id, email (unique per tenant), display_name,
  encrypted_mail_password, enabled bool, last_login_at,
  vacation_enabled, vacation_message, signature_html,
  theme_preference, created_at

user_roles                       -- separate table (never on users)
  id, user_id, role(super_admin|company_admin|user), tenant_id

app_role  ENUM(super_admin, company_admin, user)

audit_log
  id, tenant_id, actor_user_id, action, target, meta jsonb, created_at

password_reset_tokens
  id, user_id, token_hash, expires_at, used_at

-- Future modules (reserve namespaces; not built now)
contacts, calendars, tasks, ai_threads, shared_mailboxes
```

Security: `has_role(_user_id, _role)` SECURITY DEFINER function; all RLS policies use it. Explicit GRANTs per table.

## 4. Permission model

| Capability | Super Admin | Company Admin | User |
|---|---|---|---|
| Create tenants / domains | ✓ | | |
| Suspend tenant | ✓ | | |
| Manage subscriptions & limits | ✓ | | |
| Reset any password | ✓ | own tenant | own |
| Assign roles | ✓ | within tenant (not super) | |
| Manage branding | ✓ | own tenant | |
| Enable/disable user | ✓ | own tenant | |
| Enforce mailbox limit | system | system | — |
| Read/send mail | — | (own mailbox) | ✓ |
| Signature / vacation / theme | — | — | ✓ |

Enforced at server-fn middleware + RLS.

## 5. Folder structure

```text
src/
  routes/
    __root.tsx
    index.tsx                     → hostname-aware landing / redirect to /login or /mail
    login.tsx
    reset-password.tsx
    _authenticated/
      route.tsx                   → auth + tenant gate
      mail/
        index.tsx                 → inbox
        $folder.tsx               → other folders
        $folder.$uid.tsx          → message view
        compose.tsx
      settings/
        profile.tsx               (signature, vacation, theme)
        company.tsx               (admin: branding, users)
        admin.tsx                 (super admin: tenants)
    api/
      public/
        health.ts
      mail/
        webhook.ts                (future)
  lib/
    tenant.ts                     hostname → tenant resolver
    branding.ts                   CSS var injection
    mail-client.ts                calls Mail Gateway
    crypto.ts                     AES-GCM helpers
    auth.functions.ts             login / logout / reset
    tenants.functions.ts          super-admin ops
    users.functions.ts            company-admin ops
    branding.functions.ts
    mail.functions.ts             list/get/send (proxies to gateway)
  components/
    mail/ (Sidebar, MessageList, MessageView, Composer, SearchBar)
    branding/ (BrandProvider, Logo)
    admin/ (TenantTable, UserTable, BrandingEditor)
    ui/ (shadcn)
  modules/                        future — contacts/, calendar/, tasks/, ai/, guard/
```

## 6. API / server-fn surface

Auth
- `login({ email, password })` → resolves tenant from Host, verifies via Mail Gateway IMAP LOGIN, mints app session.
- `logout()`, `requestPasswordReset(email)`, `resetPassword(token, newPassword)`

Tenants (super admin)
- `createTenant`, `updateTenant`, `suspendTenant`, `setLicensedMailboxes`, `listTenants`, `platformAnalytics`

Users (company admin, scoped)
- `createUser` (blocks past licensed limit), `disableUser`, `resetUserPassword`, `assignRole`, `listUsers`

Branding
- `getBrandingByHost` (public), `updateBranding`

Mail (all proxy to Mail Gateway with session-scoped signed token)
- `listFolders`, `listMessages({folder, page, search})`, `getMessage(uid)`, `sendMessage`, `moveMessage`, `deleteMessage`, `markRead`, `flag`
- Attachments streamed via `/api/mail/attachment/$uid/$partId`

User prefs
- `updateSignature`, `updateVacation`, `updateTheme`

## 7. Branding pipeline

1. Root loader reads `request.headers.host`.
2. `getBrandingByHost` returns tenant + branding (cached).
3. `<BrandProvider>` injects CSS variables (`--primary`, `--secondary`, `--accent`) and sets logo/favicon/title in `<head>`.
4. All UI uses semantic tokens — no hardcoded colors — so each tenant themes automatically. Light/dark toggle multiplies against branding.

## 8. UI wireframes (text)

Login (`/`)
```text
┌──────────────────────────────┐
│  [Company Logo]              │
│  Welcome to {Company}        │
│  ┌────────────────────────┐  │
│  │ email                  │  │
│  │ password               │  │
│  │  [ Sign in ]           │  │
│  └────────────────────────┘  │
│  bg: login_bg_url            │
└──────────────────────────────┘
```

Mail shell (desktop)
```text
┌─Logo──┬─ Search ─────────────┬─ avatar ┐
│Inbox  │ ┌──── list ────┬─── message ──┐│
│Sent   │ │ sender·subj  │ subject      ││
│Drafts │ │ preview      │ from · date  ││
│Spam   │ │ ...          │ body         ││
│Trash  │ │              │ [reply][fwd] ││
│+Folder│ └──────────────┴──────────────┘│
└───────┴──────────────────────────────┘
```

Mobile: single column, back-button navigation, bottom compose FAB.

Admin — Super
```text
Tenants table: name · domain · status · seats used/limit · plan · actions
+ New tenant | + Assign admin | Suspend | Analytics tab
```

Admin — Company
```text
Users table: name · email · role · status · last login · actions
Branding editor: colors, logo/favicon uploads, welcome msg, preview panel
```

## 9. User flows

- Signup path: Super admin creates tenant → creates first Company Admin → sends invite email w/ reset token.
- Login: user hits `inbox.acme.com` → branded login → IMAP auth → redirect `/mail`.
- Compose: composer opens in slide-over; SMTP send via gateway; append to Sent folder via IMAP APPEND.
- Password reset: `/reset-password?token=…` (public route required).
- Suspend tenant: all sessions invalidated, login blocked with branded suspension screen.

## 10. Deployment topology

- Lovable app → Cloudflare Workers (existing).
- **Mail Gateway** → small Node service (Fly.io / a VPS on the Plesk network) exposing HTTPS endpoints: `/imap/login`, `/imap/folders`, `/imap/messages`, `/smtp/send`, etc. Uses `imapflow` + `nodemailer`. Auth via short-lived HMAC token from Lovable app. This is required because Workers cannot open raw IMAP/SMTP sockets.
- Postgres via Lovable Cloud (Supabase).
- Each tenant configures a CNAME `inbox.company.com → <lovable-app-domain>`. Custom domains + SSL managed in Lovable.

## 11. Future modules (namespaced now, built later)

Contacts · Calendar · Tasks · AI Assistant · Nyota Email Guard (anti-phish scan hook on message fetch) · Shared Mailboxes. Each becomes a folder under `src/modules/*` with its own routes, functions, and DB tables gated by feature flags on the tenant.

## 12. Phased implementation (built module-by-module after approval)

1. **Foundation** — Lovable Cloud on, schema + RLS, tenants + branding + roles, hostname resolver, brand provider, design system (Nyota One default palette), light/dark.
2. **Auth** — login (against Mail Gateway stub), sessions, password reset, `_authenticated` gate.
3. **Mail Gateway contract** — define HTTPS API + auth. (Deployed by user; we ship a mock so UI is testable.)
4. **Webmail UI** — folders, list, view, compose, search, attachments, reply/forward.
5. **User settings** — signature, vacation, theme.
6. **Company Admin** — users CRUD, license enforcement, branding editor.
7. **Super Admin** — tenants, subscriptions, analytics, global password reset.
8. **Polish** — animations, mobile refinements, empty states, a11y.
9. **Module hooks** — feature-flag scaffolding for Contacts/Calendar/Tasks/AI/Guard/Shared.

## 13. Open decisions I need from you

1. **Mail Gateway**: do you already have one, or should we design its API spec and provide a reference Node implementation you self-host?
2. **Password storage**: encrypt mail password at rest (SSO-like UX) vs. keep it only in session memory (re-prompt on session expiry)?
3. **Nyota One default palette**: do you have exact brand hex/oklch values, or should I propose a premium default (deep indigo + warm accent) for approval?
4. **Domain onboarding**: CNAME to a Lovable-managed apex, or do tenants point A-records? (Affects the custom-domain flow.)

Approve or amend, and I'll start Phase 1 (Foundation + design system + hostname-aware branding).
