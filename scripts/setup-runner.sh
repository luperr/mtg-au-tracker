#!/usr/bin/env bash
# setup-runner.sh — Install a GitHub Actions self-hosted runner on an LXC container
#
# Usage:
#   export GITHUB_REPO="your-org/mtg-au-tracker"
#   export RUNNER_TOKEN="<token from GitHub Settings → Actions → Runners → New runner>"
#   bash scripts/setup-runner.sh
#
# The script is idempotent — safe to re-run.

set -euo pipefail

RUNNER_VERSION="2.323.0"
RUNNER_USER="actions-runner"
RUNNER_DIR="/opt/actions-runner"
RUNNER_LABEL="lxc-mtg"

# ── Validate inputs ──────────────────────────────────────────────────────────
if [[ -z "${GITHUB_REPO:-}" || -z "${RUNNER_TOKEN:-}" ]]; then
  echo "ERROR: Set GITHUB_REPO and RUNNER_TOKEN before running this script."
  echo "  Get a token at: https://github.com/<org>/<repo>/settings/actions/runners/new"
  exit 1
fi

# ── System dependencies ──────────────────────────────────────────────────────
echo ">>> Installing system dependencies..."
apt-get update -qq
apt-get install -y --no-install-recommends \
  curl ca-certificates git \
  libicu-dev libssl-dev libkrb5-3 \
  docker.io docker-compose-plugin

# Allow runner user to use Docker without sudo
if ! getent group docker > /dev/null; then
  groupadd docker
fi

# ── Runner user ──────────────────────────────────────────────────────────────
if ! id "$RUNNER_USER" &>/dev/null; then
  echo ">>> Creating user $RUNNER_USER..."
  useradd --system --create-home --shell /bin/bash \
    --groups docker "$RUNNER_USER"
else
  echo ">>> User $RUNNER_USER already exists — adding to docker group"
  usermod -aG docker "$RUNNER_USER"
fi

# ── Download runner ──────────────────────────────────────────────────────────
mkdir -p "$RUNNER_DIR"
chown "$RUNNER_USER:$RUNNER_USER" "$RUNNER_DIR"

ARCH=$(dpkg --print-architecture)
case "$ARCH" in
  amd64) RUNNER_ARCH="x64" ;;
  arm64) RUNNER_ARCH="arm64" ;;
  *)     echo "Unsupported architecture: $ARCH"; exit 1 ;;
esac

TARBALL="actions-runner-linux-${RUNNER_ARCH}-${RUNNER_VERSION}.tar.gz"
DOWNLOAD_URL="https://github.com/actions/runner/releases/download/v${RUNNER_VERSION}/${TARBALL}"

if [[ ! -f "$RUNNER_DIR/run.sh" ]]; then
  echo ">>> Downloading GitHub Actions runner v${RUNNER_VERSION}..."
  curl -sSL "$DOWNLOAD_URL" -o "/tmp/$TARBALL"
  sudo -u "$RUNNER_USER" tar -xzf "/tmp/$TARBALL" -C "$RUNNER_DIR"
  rm "/tmp/$TARBALL"
else
  echo ">>> Runner binary already present, skipping download."
fi

# ── Configure ────────────────────────────────────────────────────────────────
if [[ ! -f "$RUNNER_DIR/.runner" ]]; then
  echo ">>> Configuring runner..."
  sudo -u "$RUNNER_USER" "$RUNNER_DIR/config.sh" \
    --url "https://github.com/${GITHUB_REPO}" \
    --token "$RUNNER_TOKEN" \
    --name "$(hostname)-lxc" \
    --labels "$RUNNER_LABEL" \
    --work "$RUNNER_DIR/_work" \
    --unattended \
    --replace
else
  echo ">>> Runner already configured, skipping."
fi

# ── systemd service ──────────────────────────────────────────────────────────
echo ">>> Installing systemd service..."
cat > /etc/systemd/system/actions-runner.service <<EOF
[Unit]
Description=GitHub Actions self-hosted runner
After=network-online.target docker.service
Wants=network-online.target
Requires=docker.service

[Service]
Type=simple
User=${RUNNER_USER}
WorkingDirectory=${RUNNER_DIR}
ExecStart=${RUNNER_DIR}/run.sh
Restart=always
RestartSec=5
KillSignal=SIGTERM
TimeoutStopSec=30

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable --now actions-runner

echo ""
echo "✓ Runner installed and started."
echo "  Check status: systemctl status actions-runner"
echo "  View logs:    journalctl -u actions-runner -f"
