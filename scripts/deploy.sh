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

# Everything lives in main() so bash parses the whole file before running any of it —
# the `git pull` below can rewrite this script while it is executing.
main() {
  local repo_dir="${REPO_DIR:-/opt/mtg-au-tracker}"
  local compose_file="docker-compose.prod.yml"
  export IMAGE_TAG="${1:-latest}"

  cd "$repo_dir"

  # Refreshes the compose file and this script. NOT the migrations — those are baked
  # into the scraper image (Dockerfile.scraper copies apps/scraper/, drizzle/ included),
  # so a git pull can never change which SQL db:migrate runs.
  git pull --ff-only

  echo "==> Pulling images (tag: ${IMAGE_TAG})"
  docker compose -f "$compose_file" pull web scraper

  # Apply migrations from the freshly pulled scraper image, BEFORE restarting services.
  # The old web keeps serving during this window — against the NEW schema — so every
  # migration must be backward-compatible with the release currently running.
  echo "==> Applying DB migrations"
  docker compose -f "$compose_file" run --rm scraper \
    pnpm --filter @mtg-au/scraper db:migrate

  echo "==> Starting services"
  docker compose -f "$compose_file" up -d

  # The box is disk-constrained; every deploy leaves the superseded image behind.
  echo "==> Pruning dangling images"
  docker image prune -f

  docker compose -f "$compose_file" ps
  echo "==> Deploy complete (tag: ${IMAGE_TAG})"
}

main "$@"
