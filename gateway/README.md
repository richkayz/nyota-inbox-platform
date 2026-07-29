# Nyota Inbox Mail Gateway

Production NestJS service that bridges the NyotaMail UI (Cloudflare Workers) with an
existing Plesk / Postfix / Dovecot / MariaDB stack.

**Nyota Inbox is not a mail server.** Dovecot remains the source of truth for all
email. This gateway only stores application metadata (preferences, contacts,
signatures, notification settings, audit logs, cached folder metadata).

## What it does

- Authenticates users against Dovecot IMAP using their existing mailbox credentials.
- Issues short-lived JWT access tokens + refresh tokens.
- Holds an in-memory encrypted session store so mailbox passwords never touch disk.
- Maintains a pool of long-lived IMAP connections per user.
- Runs one IMAP IDLE watcher per (user, folder) and fans out change events over SSE.
- Sends outbound mail through the local Postfix SMTP submission port.
- Exposes a cursor-paginated REST API for the UI (no page numbers, Gmail-style).
- OpenAPI docs at `/docs`.

## Layout

```
gateway/
  prisma/schema.prisma            # MariaDB schema — metadata only
  src/
    main.ts                       # Nest bootstrap, Helmet, CORS, validation, Swagger
    app.module.ts
    config/                       # typed config from .env
    prisma/                       # PrismaService
    auth/                         # login, refresh, logout, JWT strategies
    imap/                         # connection pool + IDLE dispatcher
    smtp/                         # nodemailer Postfix transport
    mail/                         # folders, messages, cursor pagination, flags, move
    sse/                          # /events stream for real-time UI updates
    contacts/ settings/ audit/    # metadata endpoints
    common/                       # guards, decorators, filters
  deploy/
    nyota-gateway.service         # systemd unit
    install.sh                    # one-shot bootstrap on Ubuntu/Plesk
    README.md                     # production deploy runbook
  .env.example
```

## Local dev

```bash
cd gateway
cp .env.example .env         # fill in DB creds + IMAP/SMTP hosts
npm install
npx prisma migrate dev
npm run start:dev
# OpenAPI: http://localhost:4000/docs
```

## Production

See `deploy/README.md`.
