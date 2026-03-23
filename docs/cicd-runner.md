# CI/CD — Self-hosted runner on Proxmox LXC

## Architecture

```
GitHub push to main
        │
        ▼
GitHub Actions "Deploy" workflow
        │  runs on: self-hosted  (label: lxc-mtg)
        ▼
actions-runner service  (inside LXC container)
        │
        ├─ docker compose build
        ├─ db migrate
        └─ docker compose up -d
```

Pull requests and non-main branches use the GitHub-hosted (`ubuntu-latest`) runner for the typecheck job — no local runner needed for that.

---

## LXC container requirements

| Requirement | Notes |
|---|---|
| OS | Ubuntu 22.04 or Debian 12 |
| CPU | 2+ cores recommended |
| RAM | 2 GB minimum (4 GB comfortable) |
| Disk | 20 GB+ (Docker image layers) |
| Docker | Must be installed; LXC must be **privileged** or have `nesting=1` + `keyctl=1` |

### Proxmox LXC config for Docker

In `/etc/pve/lxc/<CTID>.conf` on the Proxmox host, add:

```
features: keyctl=1,nesting=1
```

Or create as a privileged container if you prefer.

---

## One-time setup

### 1. Get a runner registration token

Go to:
**GitHub → your repo → Settings → Actions → Runners → New self-hosted runner**

Copy the token shown (it expires after 1 hour).

### 2. Run the setup script inside the LXC

```bash
# Inside the LXC (as root)
export GITHUB_REPO="your-org/mtg-au-tracker"
export RUNNER_TOKEN="<paste token here>"
bash scripts/setup-runner.sh
```

The script:
- Installs Docker and dependencies
- Creates a dedicated `actions-runner` system user (in the `docker` group)
- Downloads the GitHub Actions runner binary
- Registers it with your repo using the `lxc-mtg` label
- Installs and starts a `systemd` service

### 3. Verify it's connected

```bash
systemctl status actions-runner
```

Check GitHub:
**Settings → Actions → Runners** — your runner should show as **Idle**.

---

## GitHub repository secrets

Add these at **Settings → Secrets and variables → Actions**:

| Secret | Value |
|---|---|
| `DATABASE_URL` | `postgresql://mtg:<password>@db:5432/mtg_tracker` |

The deploy workflow uses `DATABASE_URL` only for the migration step. All other config comes from `.env` on disk in the project directory.

---

## How deploys work

1. Push to `main`
2. GitHub triggers the `Deploy` workflow on the LXC runner
3. Runner runs in the project directory (checked out fresh each time)
4. `docker compose build --pull` — rebuilds images from latest code
5. Migration container runs `drizzle-kit migrate`
6. `docker compose up -d --remove-orphans` — rolls services to new images
7. Health check polls `/api/health` for up to 60 seconds

The `concurrency` setting prevents two deploys from racing — a second push will queue until the first finishes.

---

## Updating the runner

GitHub runner releases: https://github.com/actions/runner/releases

To update, bump `RUNNER_VERSION` in `scripts/setup-runner.sh` and re-run the script. The existing registration is preserved (`--replace` flag handles re-registration).

---

## Removing the runner

```bash
# Inside the LXC
systemctl stop actions-runner
systemctl disable actions-runner
cd /opt/actions-runner
./config.sh remove --token <removal-token>
```

Get the removal token from GitHub the same way as the registration token.
