#!/usr/bin/env bash
# Deploy one immutable Git release tag to the Nyota frontend VPS service.
# Usage: sudo REPO_DIR=/opt/nyota-src bash deploy/deploy-frontend-release.sh v0.1.4

set -euo pipefail

VERSION="${1:-}"
REPO_DIR="${REPO_DIR:-/srv/nyota-inbox-platform}"

if [[ $EUID -ne 0 ]]; then
  echo "Run as root: sudo bash deploy/deploy-frontend-release.sh <version>" >&2
  exit 1
fi

if [[ ! "$VERSION" =~ ^v[0-9]+\.[0-9]+\.[0-9]+([-.][0-9A-Za-z.-]+)?$ ]]; then
  echo "Version must be a Git tag such as v0.1.4" >&2
  exit 1
fi

if [[ ! -d "$REPO_DIR/.git" ]]; then
  echo "No Git checkout found at $REPO_DIR" >&2
  exit 1
fi

git -C "$REPO_DIR" fetch --tags --prune origin
git -C "$REPO_DIR" rev-parse -q --verify "refs/tags/$VERSION^{commit}" >/dev/null
git -C "$REPO_DIR" checkout --detach "refs/tags/$VERSION"

REPO_SRC="$REPO_DIR" bash "$REPO_DIR/deploy/install-frontend.sh"

if [[ ! -f /opt/nyota-frontend/.output/server/index.mjs ]]; then
  echo "Frontend has not been built yet. Verify /etc/nyota-frontend/env, then rerun this command." >&2
  exit 1
fi

systemctl restart nyota-frontend
curl -fsS http://127.0.0.1:3000/ >/dev/null
echo "Nyota frontend $VERSION is live."
