# Proxmox Deployment Guide

## VM Setup (one-time)

Recommended specs: Ubuntu 24.04, 4GB RAM, 2 vCPU, 50GB disk.

```bash
# Install Docker
curl -fsSL https://get.docker.com | sh
usermod -aG docker $USER
newgrp docker

# Clone repo
git clone <your-repo-url> /opt/mtg-au-tracker
cd /opt/mtg-au-tracker

# Create environment file
cat > .env << 'EOF'
DB_PASSWORD=<choose-a-strong-password>
EOF
```

## First-time Database Bootstrap

```bash
cd /opt/mtg-au-tracker

# 1. Start the database
docker compose -f docker-compose.prod.yml up db -d

# 2. Run migrations (creates all tables)
docker compose -f docker-compose.prod.yml run --rm scraper pnpm db:migrate

# 3. Seed stores table (MTG Mate, Good Games, etc.)
docker compose -f docker-compose.prod.yml run --rm scraper pnpm --filter @mtg-au/scraper seed

# 4. Start all services
#    The scraper will detect an empty DB and run the Scryfall import automatically (~10-15 min)
docker compose -f docker-compose.prod.yml up -d

# Watch the bootstrap import
docker compose -f docker-compose.prod.yml logs scraper -f
```

## Daily Schedule (automatic)

Once running, the scraper service handles everything on a cron schedule:

| Time  | Job |
|-------|-----|
| 3 AM  | Scryfall bulk import — refreshes card data + USD prices |
| 5 AM  | Store scrapers — MTG Mate prices → store_prices + price_history |

## Cloudflare Tunnel Setup

```bash
# Install cloudflared
curl -L https://pkg.cloudflare.com/cloudflare-main.gpg | gpg --dearmor > /usr/share/keyrings/cloudflare-main.gpg
echo "deb [signed-by=/usr/share/keyrings/cloudflare-main.gpg] https://pkg.cloudflare.com/cloudflared any main" \
  > /etc/apt/sources.list.d/cloudflared.list
apt update && apt install cloudflared

# Authenticate (opens browser)
cloudflared tunnel login

# Create tunnel
cloudflared tunnel create mtg-tracker

# Configure — replace <tunnel-id> and your domain
mkdir -p /etc/cloudflared
cat > /etc/cloudflared/config.yml << 'EOF'
tunnel: <tunnel-id>
credentials-file: /root/.cloudflared/<tunnel-id>.json
ingress:
  - hostname: mtg.yourdomain.com
    service: http://localhost:3000
  - service: http_status:404
EOF

# Add DNS record (points your subdomain at the tunnel)
cloudflared tunnel route dns mtg-tracker mtg.yourdomain.com

# Install as a systemd service so it starts on boot
cloudflared service install
systemctl enable --now cloudflared
```

## Useful Commands

```bash
# View logs
docker compose -f docker-compose.prod.yml logs scraper -f
docker compose -f docker-compose.prod.yml logs web -f

# Check service status
docker compose -f docker-compose.prod.yml ps

# Trigger a manual store scrape (without waiting for 5 AM)
docker compose -f docker-compose.prod.yml run --rm scraper pnpm scrape:stores

# Trigger a manual Scryfall import
docker compose -f docker-compose.prod.yml run --rm scraper \
  sh -c "pnpm --filter @mtg-au/scraper scrape:scryfall && pnpm --filter @mtg-au/scraper import:scryfall"

# Check price history is accumulating
docker compose -f docker-compose.prod.yml exec db \
  psql -U mtg -d mtg_tracker -c "SELECT COUNT(*), MAX(recorded_at) FROM price_history;"

# Restart after code update
git pull
docker compose -f docker-compose.prod.yml build
docker compose -f docker-compose.prod.yml up -d
```

## Migrating to AWS RDS (when ready)

No code changes needed — only the database connection moves.

```bash
# 1. Export data from local postgres
docker compose -f docker-compose.prod.yml exec db \
  pg_dump -U mtg mtg_tracker > mtg_tracker_$(date +%Y%m%d).sql

# 2. Provision RDS PostgreSQL 16 on AWS
#    - Enable deletion protection
#    - Set up VPC security group to allow inbound 5432 from the VM IP

# 3. Restore to RDS
psql -h <rds-endpoint> -U mtg -d mtg_tracker < mtg_tracker_YYYYMMDD.sql

# 4. Update .env — add DATABASE_URL pointing at RDS, keep DB_PASSWORD for reference
echo "DATABASE_URL=postgresql://mtg:<password>@<rds-endpoint>:5432/mtg_tracker" >> .env

# 5. Update docker-compose.prod.yml — remove db service, use DATABASE_URL env var directly
#    In scraper and web services, change:
#      DATABASE_URL: postgresql://mtg:${DB_PASSWORD}@db:5432/mtg_tracker
#    To:
#      DATABASE_URL: ${DATABASE_URL}

# 6. Restart without local db
docker compose -f docker-compose.prod.yml stop db
docker compose -f docker-compose.prod.yml up -d scraper web
```

For ECS deployment later: inject `DATABASE_URL` via ECS task definition environment variables
or AWS SSM Parameter Store — no other changes required.
