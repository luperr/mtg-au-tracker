#!/usr/bin/env bash
#
# Pull-based production deploy. Images are built + pushed by GitHub Actions
# (.github/workflows/deploy-images.yml) — this script never builds them.
#
# Usage:
#   ./scripts/deploy.sh                 # deploy :latest
#   ./scripts/deploy.sh main-abc1234    # pin/rollback to a specific image tag
#
# Run from the repo checkout on the server (e.g. /opt/mtg-au-tracker).
set -euo pipefail

REPO_DIR="${REPO_DIR:-/opt/mtg-au-tracker}"
COMPOSE_FILE="docker-compose.prod.yml"
export IMAGE_TAG="${1:-latest}"

cd "$REPO_DIR"

# Refresh the compose file, migration SQL, and this script on disk.
# (Not a build — the app itself ships inside the pulled images.)
git pull --ff-only

echo "==> Pulling images (tag: ${IMAGE_TAG})"
docker compose -f "$COMPOSE_FILE" pull web scraper

# Apply migrations from the freshly pulled scraper image, BEFORE restarting
# services, so the running web keeps serving the old schema until it's ready.
echo "==> Applying DB migrations"
docker compose -f "$COMPOSE_FILE" run --rm scraper \
  pnpm --filter @mtg-au/scraper db:migrate

echo "==> Starting services"
docker compose -f "$COMPOSE_FILE" up -d

docker compose -f "$COMPOSE_FILE" ps
echo "==> Deploy complete (tag: ${IMAGE_TAG})"
