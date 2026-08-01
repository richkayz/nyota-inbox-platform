#!/usr/bin/env bash
# Deploy one immutable Git release tag to a Nyota gateway VPS.
# Usage: sudo bash gateway/deploy/deploy-release.sh v0.1.0

set -euo pipefail

VERSION="${1:-}"
REPO_DIR="${REPO_DIR:-/srv/nyota-inbox-platform}"

if [[ $EUID -ne 0 ]]; then
  echo "Run as root: sudo bash gateway/deploy/deploy-release.sh <version>" >&2
  exit 1
fi

if [[ ! "$VERSION" =~ ^v[0-9]+\.[0-9]+\.[0-9]+([-.][0-9A-Za-z.-]+)?$ ]]; then
  echo "Version must be a Git tag such as v0.1.0" >&2
  exit 1
fi

if [[ ! -d "$REPO_DIR/.git" ]]; then
  echo "No Git checkout found at $REPO_DIR" >&2
  exit 1
fi

git -C "$REPO_DIR" fetch --tags --prune origin

if ! git -C "$REPO_DIR" rev-parse -q --verify "refs/tags/$VERSION^{commit}" >/dev/null; then
  echo "Release tag $VERSION does not exist on origin" >&2
  exit 1
fi

# A detached checkout makes the deployed commit explicit and prevents an
# accidental `git pull` from moving production to an unreviewed commit.
git -C "$REPO_DIR" checkout --detach "refs/tags/$VERSION"

REPO_SRC="$REPO_DIR/gateway" bash "$REPO_DIR/gateway/deploy/install.sh"
systemctl restart nyota-gateway
curl -fsS http://127.0.0.1:4000/health >/dev/null

echo "Nyota gateway $VERSION is live."
