# Production Readiness Checklist — Nyota Inbox Gateway

Complete every item below **before** flipping `VITE_API_MODE=live` and pointing users at the gateway. The Connection Diagnostics page (`/settings/diagnostics`) exists to verify each of these end-to-end from the browser once you have finished.

---

## 1. Environment variables (`/etc/nyota-gateway/env`)

| Variable | Required | Example | Notes |
| --- | --- | --- | --- |
| `PORT` | ✓ | `4000` | Bound to `127.0.0.1` — never exposed publicly. |
| `NODE_ENV` | ✓ | `production` | |
| `PUBLIC_GATEWAY_URL` | ✓ | `https://inbox.example.com/api` | Reported by `/health` for diagnostics. |
| `CORS_ORIGINS` | ✓ | `https://inbox.example.com` | Comma-separated. Must include every UI origin. |
| `DATABASE_URL` | ✓ | `mysql://nyota:PASS@127.0.0.1:3306/nyota_gateway` | MariaDB, loopback only. |
| `JWT_ACCESS_SECRET` | ✓ | 64 hex chars | `openssl rand -hex 32`. Rotate on incident. |
| `JWT_ACCESS_TTL` | ✓ | `900` | Seconds. 15 min recommended. |
| `JWT_REFRESH_SECRET` | ✓ | 64 hex chars | Separate value from the access secret. |
| `JWT_REFRESH_TTL` | ✓ | `1209600` | Seconds. 14 days recommended. |
| `SESSION_ENCRYPTION_KEY` | ✓ | 32 base64 bytes | `openssl rand -base64 32`. Encrypts mailbox passwords in memory. |
| `IMAP_HOST` | ✓ | `127.0.0.1` | Dovecot on the same host. |
| `IMAP_PORT` | ✓ | `993` | Implicit TLS. Use `143` only with `IMAP_SECURE=false` + STARTTLS. |
| `IMAP_SECURE` | ✓ | `true` | |
| `IMAP_POOL_MAX` | ✓ | `4` | Per user. Keep below Dovecot `mail_max_userip_connections`. |
| `SMTP_HOST` | ✓ | `127.0.0.1` | Postfix submission. |
| `SMTP_PORT` | ✓ | `587` | |
| `SMTP_SECURE` | ✓ | `false` | STARTTLS is used explicitly. |
| `SMTP_REQUIRE_TLS` | ✓ | `true` | Refuse to send if the server won't upgrade. |
| `THROTTLE_TTL` | ✓ | `60` | Rate-limit window (seconds). |
| `THROTTLE_LIMIT` | ✓ | `120` | Requests per IP per window. |

File permissions: `chown root:nyota /etc/nyota-gateway/env && chmod 0640 /etc/nyota-gateway/env`.

---

## 2. DNS records

For the UI hostname (e.g. `inbox.example.com`) that terminates TLS at Plesk / nginx:

- **A / AAAA** records pointing to the Plesk server public IP(s).
- **CAA** record allowing your certificate issuer (usually `letsencrypt.org`).
- Existing **MX / SPF / DKIM / DMARC** records for the mail domains stay unchanged — Nyota Inbox does not deliver mail, it uses Postfix.
- Confirm `dig +short inbox.example.com` returns the expected IP from at least two resolvers before issuing a certificate.

No DNS changes are needed on the gateway itself — it is only reachable on `127.0.0.1:4000`.

---

## 3. Firewall rules (UFW / Plesk firewall)

Only the reverse proxy and administrative ports should be open on the WAN side:

| Port | Protocol | Direction | Purpose |
| --- | --- | --- | --- |
| 22 | TCP | Inbound (allow-list) | SSH admin |
| 80 | TCP | Inbound | HTTP → 301 redirect to HTTPS |
| 443 | TCP | Inbound | HTTPS (UI + `/api/`) |
| 25 | TCP | Inbound | Existing Postfix MTA |
| 465 / 587 | TCP | Inbound | Existing Postfix submission (unchanged) |
| 993 / 995 | TCP | Inbound | Existing Dovecot IMAP/POP3 (unchanged) |
| **4000** | TCP | **Inbound: DENY from WAN** | Gateway must be loopback-only |
| 3306 | TCP | Inbound: DENY from WAN | MariaDB loopback-only |

Verify: `ss -ltnp | grep 4000` shows `127.0.0.1:4000`, never `0.0.0.0:4000`. Outbound egress from the gateway host is not required for normal operation.

---

## 4. SSL / TLS certificates

- **UI + API (Plesk / nginx)**: Let's Encrypt (or commercial) certificate covering `inbox.example.com`. Renewal handled by Plesk's Let's Encrypt extension or `certbot --nginx`.
- **Dovecot**: existing certificate for the mail hostname (`mail.example.com`). The gateway connects on `127.0.0.1:993` — self-signed / hostname-mismatched certs on loopback are acceptable, but production should use the same trusted cert Dovecot serves externally.
- **Postfix submission (587)**: same certificate as Dovecot; STARTTLS is mandatory. Verify with `openssl s_client -starttls smtp -connect 127.0.0.1:587`.
- **HSTS** on the public origin: `Strict-Transport-Security: max-age=63072000; includeSubDomains; preload`.
- The gateway itself does **not** terminate TLS — all inbound TLS ends at nginx.

---

## 5. Plesk configuration

- **Mail server**: Postfix + Dovecot enabled in *Tools & Settings → Mail Server Settings*. IMAP IDLE is enabled by default in Dovecot; confirm with `doveadm config | grep -i idle`.
- **Mailboxes**: every user Nyota Inbox will serve must exist in Plesk as a real mailbox with a working password (Nyota does not create mailboxes; it authenticates against them).
- **Dovecot limits**: raise `mail_max_userip_connections` to at least `10` (default is often `10` already) so the gateway pool + Roundcube + phone clients coexist.
  ```
  # /etc/dovecot/conf.d/20-imap.conf
  protocol imap {
    mail_max_userip_connections = 20
  }
  ```
- **Postfix submission**: SASL via Dovecot enabled (see `deploy/README.md` § 3). TLS enforced with `smtpd_tls_security_level = encrypt`.
- **Roundcube coexistence**: no changes required. Nyota Inbox and Roundcube can serve the same mailboxes concurrently.
- **Plesk firewall extension**: mirror the rules in § 3.
- **fail2ban** (recommended): keep the default `postfix-sasl`, `dovecot`, and `sshd` jails; the gateway's own `ThrottlerModule` handles UI-side abuse.

---

## 6. MariaDB

- Dedicated database + user bound to `127.0.0.1` (see `deploy/README.md` § 1).
- `bind-address = 127.0.0.1` in `/etc/mysql/mariadb.conf.d/50-server.cnf`.
- Daily logical backup (`mysqldump nyota_gateway`) alongside Plesk's existing backup job. The gateway holds **metadata only** — email bodies stay on Dovecot's mail spool.
- Run `npx prisma migrate deploy` on every gateway upgrade (the installer does this automatically).

---

## 7. Verification order

Once the service is up (`systemctl start nyota-gateway`):

1. `curl -sf http://127.0.0.1:4000/health` → `{ "status": "ok", "version": …}`.
2. `curl -sf http://127.0.0.1:4000/health/imap | jq .ok` → `true` (reads Dovecot greeting).
3. `curl -sf http://127.0.0.1:4000/health/smtp | jq .ok` → `true` (verifies Postfix submission).
4. `curl -sf http://127.0.0.1:4000/health/database | jq .ok` → `true`.
5. From the browser: sign in at `https://inbox.example.com/`, open **Settings → Connection diagnostics**, and confirm every card is green — IMAP reachable, SMTP reachable, database, IMAP authentication, TLS on, IDLE supported, folders visible.
6. Click **Test IMAP login** and **Test SMTP send** — both must report OK with a real latency in milliseconds.
7. **Download report** and archive the JSON with the deployment ticket.

The application is not considered production-ready until every step above succeeds against the real Plesk server. The diagnostics page is authoritative — if it is not fully green, do not open the app to users.
