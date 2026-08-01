#!/usr/bin/env bash
# Nyota Inbox Mail Gateway — one-shot installer for Ubuntu / Plesk hosts.
# Idempotent: safe to run repeatedly.

set -euo pipefail

APP_DIR=/opt/nyota-gateway
ENV_DIR=/etc/nyota-gateway
LOG_DIR=/var/log/nyota-gateway
USER=nyota
NODE_MAJOR=20
REPO_SRC="${REPO_SRC:-$(pwd)}"   # override for CI
ENV_CREATED=false

require_root() {
  if [[ $EUID -ne 0 ]]; then
    echo "Run as root (sudo $0)" >&2
    exit 1
  fi
}

install_node() {
  if command -v node >/dev/null && [[ "$(node -v)" =~ ^v${NODE_MAJOR}\. ]]; then
    return
  fi
  echo "Installing Node.js ${NODE_MAJOR}.x"
  curl -fsSL "https://deb.nodesource.com/setup_${NODE_MAJOR}.x" | bash -
  apt-get install -y nodejs
}

ensure_user() {
  if ! id "$USER" &>/dev/null; then
    useradd --system --home "$APP_DIR" --shell /usr/sbin/nologin "$USER"
  fi
}

ensure_dirs() {
  install -d -o "$USER" -g "$USER" -m 0750 "$APP_DIR" "$LOG_DIR"
  install -d -o root -g "$USER" -m 0750 "$ENV_DIR"
}

sync_app() {
  echo "Syncing gateway sources → $APP_DIR"
  rsync -a --delete \
    --exclude node_modules \
    --exclude .env \
    --exclude '.git' \
    "$REPO_SRC/" "$APP_DIR/"
  chown -R "$USER:$USER" "$APP_DIR"
}

build_app() {
  # The Nest compiler and Prisma CLI are development dependencies, so include
  # them explicitly even when the server environment is production.
  su -s /bin/bash "$USER" -c "cd $APP_DIR && npm ci --include=dev && npx prisma generate && npm run build"
}

migrate_db() {
  su -s /bin/bash "$USER" -c "set -a && . $ENV_DIR/env && set +a && cd $APP_DIR && npx prisma migrate deploy" || {
    echo "Prisma migrate failed — check DATABASE_URL in $ENV_DIR/env" >&2
    exit 1
  }
}

install_env() {
  if [[ ! -f "$ENV_DIR/env" ]]; then
    install -m 0640 -o root -g "$USER" "$APP_DIR/.env.example" "$ENV_DIR/env"
    ENV_CREATED=true
    echo ">>> Edit $ENV_DIR/env before starting the service."
  fi
}

install_service() {
  install -m 0644 "$APP_DIR/deploy/nyota-gateway.service" /etc/systemd/system/nyota-gateway.service
  systemctl daemon-reload
  systemctl enable nyota-gateway
}

main() {
  require_root
  apt-get update
  apt-get install -y curl rsync ca-certificates
  install_node
  ensure_user
  ensure_dirs
  sync_app
  install_env
  build_app
  install_service
  if [[ "$ENV_CREATED" == true ]]; then
    echo "Environment template created at $ENV_DIR/env. Configure it, then rerun this installer."
    exit 0
  fi
  migrate_db
  echo "Done. Start with: systemctl start nyota-gateway"
  echo "Health check:     curl -sf http://127.0.0.1:4000/docs >/dev/null && echo OK"
}

main "$@"
