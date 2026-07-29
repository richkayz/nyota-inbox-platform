# Production deployment — Ubuntu + Plesk

The gateway runs as a systemd service on the same Ubuntu host as Plesk,
Postfix, Dovecot, and MariaDB. It talks to Dovecot on `127.0.0.1:993` and
Postfix on `127.0.0.1:587`, so no firewall changes are needed for those.

## 1. MariaDB — application database

```sql
CREATE DATABASE nyota_gateway CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER 'nyota'@'127.0.0.1' IDENTIFIED BY 'CHANGE_ME_STRONG_PASSWORD';
GRANT ALL PRIVILEGES ON nyota_gateway.* TO 'nyota'@'127.0.0.1';
FLUSH PRIVILEGES;
```

Confirm Plesk's own MariaDB is bound to loopback only.

## 2. Dovecot — IMAP source of truth

Nothing to change in Dovecot config. The gateway authenticates with each
end-user's existing mailbox password. Recommended: enable
`imap-hibernate` and `mail_max_userip_connections=10` so a small pool per
user stays comfortable inside Dovecot's limits.

## 3. Postfix — SMTP submission

Ensure the submission port (587) is enabled with STARTTLS + SASL in
`/etc/postfix/master.cf`:

```
submission inet n       -       y       -       -       smtpd
  -o syslog_name=postfix/submission
  -o smtpd_tls_security_level=encrypt
  -o smtpd_sasl_auth_enable=yes
  -o smtpd_sasl_type=dovecot
  -o smtpd_sasl_path=private/auth
```

## 4. Install the gateway

From a checkout of this repo on the server:

```bash
sudo REPO_SRC=$(pwd)/gateway bash gateway/deploy/install.sh
sudoedit /etc/nyota-gateway/env      # fill in DB / JWT / session secrets
sudo systemctl start nyota-gateway
sudo systemctl status nyota-gateway
curl -s http://127.0.0.1:4000/docs | head    # OpenAPI is up
```

Generate secrets with:

```bash
openssl rand -hex 32                                     # JWT_ACCESS_SECRET / JWT_REFRESH_SECRET
openssl rand -base64 32                                  # SESSION_ENCRYPTION_KEY
```

## 5. Nginx / Plesk reverse proxy

Terminate TLS at the existing Plesk nginx and forward `/api/` to the
gateway. Long-lived SSE requires the proxy to keep connections open.

```nginx
location /api/ {
    proxy_pass http://127.0.0.1:4000/;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto https;
    proxy_buffering off;                # SSE
    proxy_read_timeout 3600s;           # SSE
    proxy_send_timeout 3600s;
}
```

## 6. Point the UI at the gateway

In the Cloudflare Workers UI deployment set:

```
VITE_API_MODE=live
VITE_API_BASE_URL=https://inbox.example.com/api
```

## 7. Operational tips

- **Logs**: `journalctl -u nyota-gateway -f`
- **Restart**: `systemctl restart nyota-gateway`
- **DB migrations on upgrade**: rerun `install.sh` — it re-runs
  `prisma migrate deploy` idempotently.
- **Rotating secrets**: update `/etc/nyota-gateway/env` and restart. All
  active sessions will be invalidated; users re-authenticate.
- **Never** expose port 4000 to the public internet. Nginx is the only
  entry point.
