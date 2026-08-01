#!/usr/bin/env bash
# Build and install the Nyota Inbox frontend from a checked-out release.

set -euo pipefail

APP_DIR=/opt/nyota-frontend
ENV_DIR=/etc/nyota-frontend
USER=nyota
REPO_SRC="${REPO_SRC:-$(pwd)}"
ENV_CREATED=false

require_root() {
  if [[ $EUID -ne 0 ]]; then
    echo "Run as root (sudo $0)" >&2
    exit 1
  fi
}

ensure_user_and_dirs() {
  if ! id "$USER" &>/dev/null; then
    useradd --system --home "$APP_DIR" --shell /usr/sbin/nologin "$USER"
  fi
  install -d -o "$USER" -g "$USER" -m 0750 "$APP_DIR"
  install -d -o root -g "$USER" -m 0750 "$ENV_DIR"
}

sync_app() {
  echo "Syncing frontend sources -> $APP_DIR"
  rsync -a --delete \
    --exclude .git \
    --exclude gateway \
    --exclude node_modules \
    --exclude .output \
    --exclude .env \
    --exclude .env.local \
    "$REPO_SRC/" "$APP_DIR/"
  chown -R "$USER:$USER" "$APP_DIR"
}

install_env() {
  if [[ ! -f "$ENV_DIR/env" ]]; then
    install -m 0640 -o root -g "$USER" "$APP_DIR/.env.frontend.example" "$ENV_DIR/env"
    ENV_CREATED=true
    echo ">>> Edit $ENV_DIR/env before building the frontend."
  fi
}

build_app() {
  su -s /bin/bash "$USER" -c "set -a && . $ENV_DIR/env && set +a && cd $APP_DIR && npm ci --include=dev && npm run build"
}

install_service() {
  install -m 0644 "$APP_DIR/deploy/nyota-frontend.service" /etc/systemd/system/nyota-frontend.service
  systemctl daemon-reload
  systemctl enable nyota-frontend
}

main() {
  require_root
  ensure_user_and_dirs
  sync_app
  install_env
  install_service
  if [[ "$ENV_CREATED" == true ]]; then
    echo "Environment template created at $ENV_DIR/env. Configure it, then rerun this installer."
    exit 0
  fi
  build_app
}

main "$@"
