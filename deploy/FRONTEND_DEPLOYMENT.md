# Nyota Inbox frontend on Plesk

The frontend is a Nitro Node server on `127.0.0.1:3000`. Plesk/nginx owns TLS
and forwards the public inbox hostname to that service. The gateway remains on
`127.0.0.1:4000` behind `/api`.

## First deployment

```bash
cd /opt/nyota-src
git fetch --tags origin
git checkout --detach v0.1.4
sudo REPO_DIR=/opt/nyota-src bash deploy/deploy-frontend-release.sh v0.1.4
```

The first run creates `/etc/nyota-frontend/env`. Keep `VITE_GATEWAY_URL=/api`
so the browser calls the gateway through the same tenant hostname. Rerun the
same command after confirming the file.

## Plesk proxy configuration

In **Plesk → Websites & Domains → inbox.nyotaone.com → Apache & nginx
Settings**, paste the following into **Additional nginx directives** and apply:

```nginx
location /api/ {
    proxy_pass http://127.0.0.1:4000/;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-Host $host;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_buffering off;
    proxy_read_timeout 3600s;
}

location / {
    proxy_pass http://127.0.0.1:3000;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-Host $host;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
}
```

Verify the private service with `curl -I http://127.0.0.1:3000/`, then open
`https://inbox.nyotaone.com` in a browser.
