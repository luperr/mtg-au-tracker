# Scrymarket — Ops Reference

## Starting services

```bash
# Start everything
docker compose -f docker-compose.prod.yml up -d

# Start a single service
docker compose -f docker-compose.prod.yml up -d web
docker compose -f docker-compose.prod.yml up -d scraper

# Rebuild and restart after a code change
git pull
docker compose -f docker-compose.prod.yml build web
docker compose -f docker-compose.prod.yml up -d web
```

---

## Viewing logs

```bash
# Follow scraper logs live
docker compose -f docker-compose.prod.yml logs scraper -f

# Last 200 lines of web logs
docker compose -f docker-compose.prod.yml logs web --tail=200

# Everything from the last 24 hours
docker compose -f docker-compose.prod.yml logs --since 24h

# All services, last hour
docker compose -f docker-compose.prod.yml logs --since 1h
```

---

## Checking scraper run health

### Did the last Scryfall import succeed?
```bash
docker compose -f docker-compose.prod.yml exec db \
  psql -U mtg -d mtg_tracker -c \
  "SELECT COUNT(*) AS cards FROM cards; SELECT COUNT(*) AS printings FROM printings;"
```
Expected: ~32k cards, ~141k printings. Significantly lower = import failed or was interrupted.

### Did the last store scrape run and write prices?
```bash
docker compose -f docker-compose.prod.yml exec db \
  psql -U mtg -d mtg_tracker -c \
  "SELECT store_id, COUNT(*) AS rows, MAX(updated_at) AS last_updated
   FROM store_prices
   GROUP BY store_id
   ORDER BY last_updated DESC;"
```
Check `last_updated` — should be from today's 5 AM run.

### Did the last eBay import run and write prices?
```bash
docker compose -f docker-compose.prod.yml exec db \
  psql -U mtg -d mtg_tracker -c \
  "SELECT COUNT(*) AS ebay_prices, MAX(updated_at) AS last_updated
   FROM store_prices WHERE store_id = 'ebay_au';"
```
If `ebay_prices` is 0, the import was interrupted — re-run it manually.

### Is price history accumulating?
```bash
docker compose -f docker-compose.prod.yml exec db \
  psql -U mtg -d mtg_tracker -c \
  "SELECT DATE(recorded_at) AS day, COUNT(*) AS snapshots
   FROM price_history
   GROUP BY day
   ORDER BY day DESC
   LIMIT 7;"
```
Should see a row per day. Missing days = scraper didn't run that day.

### What failed to match in the last scrape?
```bash
docker compose -f docker-compose.prod.yml exec db \
  psql -U mtg -d mtg_tracker -c \
  "SELECT store_id, COUNT(*) AS unmatched
   FROM unmatched_cards
   GROUP BY store_id;"
```

```bash
# See the actual unmatched titles (most recent 20)
docker compose -f docker-compose.prod.yml exec db \
  psql -U mtg -d mtg_tracker -c \
  "SELECT store_id, raw_name, set_name, scraped_at
   FROM unmatched_cards
   ORDER BY scraped_at DESC
   LIMIT 20;"
```

---

## Triggering manual runs

```bash
# Run Scryfall import manually
docker compose -f docker-compose.prod.yml run --rm scraper \
  pnpm --filter @mtg-au/scraper import:scryfall

# Run all store scrapers (MTG Mate + Good Games)
docker compose -f docker-compose.prod.yml run --rm scraper \
  pnpm --filter @mtg-au/scraper scrape:stores

# Run MTG Mate scraper only
docker compose -f docker-compose.prod.yml run --rm scraper \
  pnpm --filter @mtg-au/scraper scrape:mtgmate

# Run Good Games scraper only
docker compose -f docker-compose.prod.yml run --rm scraper \
  pnpm --filter @mtg-au/scraper scrape:goodgames

# Run eBay import manually
docker compose -f docker-compose.prod.yml run --rm scraper \
  pnpm --filter @mtg-au/scraper scrape:ebay
```

---

## Database operations

```bash
# Open a psql shell
docker compose -f docker-compose.prod.yml exec db psql -U mtg -d mtg_tracker

# Run a migration
docker compose -f docker-compose.prod.yml run --rm scraper \
  pnpm --filter @mtg-au/scraper db:migrate

# Backup the database
docker compose -f docker-compose.prod.yml exec db \
  pg_dump -U mtg mtg_tracker > mtg_tracker_$(date +%Y%m%d).sql
```

---

## First-time server setup

```bash
# 1. Install Docker
curl -fsSL https://get.docker.com | sh
usermod -aG docker $USER && newgrp docker

# 2. Clone repo
git clone <your-repo-url> /opt/mtg-au-tracker
cd /opt/mtg-au-tracker

# 3. Create .env
cp .env.example .env
# Edit .env — set DB_PASSWORD, EBAY_CLIENT_ID, EBAY_CLIENT_SECRET, CLOUDFLARE_TUNNEL_TOKEN

# 4. Start DB and run migrations
docker compose -f docker-compose.prod.yml up db -d
docker compose -f docker-compose.prod.yml run --rm scraper pnpm --filter @mtg-au/scraper db:migrate

# 5. Seed stores table
docker compose -f docker-compose.prod.yml run --rm scraper pnpm --filter @mtg-au/scraper seed

# 6. Start all services (scraper will auto-run Scryfall import on first start, ~10-15 min)
docker compose -f docker-compose.prod.yml up -d
docker compose -f docker-compose.prod.yml logs scraper -f
```

---

## Migrating to AWS RDS (when ready)

```bash
# 1. Export data
docker compose -f docker-compose.prod.yml exec db \
  pg_dump -U mtg mtg_tracker > mtg_tracker_$(date +%Y%m%d).sql

# 2. Restore to RDS
psql -h <rds-endpoint> -U mtg -d mtg_tracker < mtg_tracker_YYYYMMDD.sql

# 3. Update .env — set DATABASE_URL to RDS endpoint
# 4. In docker-compose.prod.yml — remove db service, change DATABASE_URL to ${DATABASE_URL}
# 5. Restart without local db
docker compose -f docker-compose.prod.yml stop db
docker compose -f docker-compose.prod.yml up -d scraper web
```

show cards with postage
``` bash
docker compose -f docker-compose.prod.yml exec db \
  psql -U mtg -d mtg_tracker -c \
  "SELECT c.name, sp.store_id, sp.price_aud, sp.shipping_aud, sp.condition, sp.url
   FROM store_prices sp
   JOIN printings p ON sp.printing_id = p.id
   JOIN cards c ON p.card_id = c.id
   WHERE sp.shipping_aud IS NOT NULL
   ORDER BY sp.shipping_aud::numeric DESC
   LIMIT 20;"
```

show total number of cards with postage
``` bash
docker compose -f docker-compose.prod.yml exec db \
  psql -U mtg -d mtg_tracker -c \
  "SELECT store_id, COUNT(*) AS with_postage
   FROM store_prices
   WHERE shipping_aud IS NOT NULL
   GROUP BY store_id
   ORDER BY with_postage DESC;"
```