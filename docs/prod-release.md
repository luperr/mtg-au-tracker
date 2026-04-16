# Scrymarket — Production Release Guide

## Pre-release checklist

- [ ] Branch is merged to `main`
- [ ] `pnpm --filter @mtg-au/web build` passes locally (no type errors)
- [ ] Any new migrations were generated with `db:generate` (NOT hand-written) — hand-written SQL files are silently skipped by `drizzle-kit migrate` because they won't appear in `drizzle/meta/_journal.json`
- [ ] `drizzle/meta/_journal.json` entry count matches the number of `.sql` files in `drizzle/`: `ls apps/scraper/drizzle/*.sql | wc -l` should equal the number of `entries` in the journal
- [ ] `.env.example` updated if new env vars were added
- [ ] `docker-quick-ref.md` updated if new manual commands are needed

---

## Standard release (code changes only, no migration)

```bash
cd /opt/mtg-au-tracker

# 1. Pull latest
git pull

# 2. Rebuild changed services
docker compose -f docker-compose.prod.yml build web scraper

# 3. Restart
docker compose -f docker-compose.prod.yml up -d

# 4. Verify
docker compose -f docker-compose.prod.yml logs web --tail=50
docker compose -f docker-compose.prod.yml logs scraper --tail=50
```

---

## Release with a DB migration

Run the migration **before** restarting services. A running web container will
continue serving the old schema while the migration applies cleanly.

> **Important:** `db:migrate` uses whatever migration files are baked into the
> running scraper image. If this release **modifies an existing migration file**
> (not just adds a new one), rebuild the scraper image first so `db:migrate`
> picks up the fixed files — then proceed as normal.

```bash
cd /opt/mtg-au-tracker

# 1. Pull latest
git pull

# 2. Apply migration (safe to run against live DB)
docker compose -f docker-compose.prod.yml run --rm scraper \
  pnpm --filter @mtg-au/scraper db:migrate

# 3. Confirm migration applied
docker compose -f docker-compose.prod.yml exec db \
  psql -U mtg -d mtg_tracker -c \
  "SELECT version, created_at FROM drizzle.__drizzle_migrations ORDER BY created_at DESC LIMIT 5;"

# 4. Rebuild and restart
docker compose -f docker-compose.prod.yml build web scraper
docker compose -f docker-compose.prod.yml up -d

# 5. Verify services are healthy
docker compose -f docker-compose.prod.yml ps
docker compose -f docker-compose.prod.yml logs web --tail=50
```

---

## Release requiring a Scryfall re-import

Some changes need fresh Scryfall data to take effect (e.g. new fields on the
`sets` table). Run the import after services are up.

```bash
# Trigger a Scryfall import manually (runs in foreground, ~10-15 min)
docker compose -f docker-compose.prod.yml run --rm scraper \
  pnpm --filter @mtg-au/scraper import:scryfall

# Verify the import populated expected data
docker compose -f docker-compose.prod.yml exec db \
  psql -U mtg -d mtg_tracker -c \
  "SELECT COUNT(*) AS cards FROM cards;
   SELECT COUNT(*) AS printings FROM printings;
   SELECT COUNT(*) AS sets FROM sets;
   SELECT set_type, COUNT(*) FROM sets GROUP BY set_type ORDER BY 2 DESC LIMIT 10;"
```

Expected: ~32k cards, ~141k printings, ~700+ sets with `set_type` populated.

---

## Rollback

### Code-only rollback

```bash
git revert HEAD   # or: git checkout <previous-commit>
docker compose -f docker-compose.prod.yml build web scraper
docker compose -f docker-compose.prod.yml up -d
```

### Migration rollback

Drizzle does not generate automatic down migrations. To roll back a schema
change you must write the inverse SQL manually and run it via psql:

```bash
docker compose -f docker-compose.prod.yml exec db psql -U mtg -d mtg_tracker
```

Then execute the inverse DDL (e.g. `DROP TABLE sets;` to undo the sets table migration).
After reverting the schema, also revert the code and redeploy.

> **Before any migration:** take a DB backup.
> ```bash
> docker compose -f docker-compose.prod.yml exec db \
>   pg_dump -U mtg mtg_tracker > mtg_tracker_backup_$(date +%Y%m%d_%H%M).sql
> ```

---

## Post-deploy smoke tests

```bash
# Services are up
docker compose -f docker-compose.prod.yml ps

# Web is responding
curl -s -o /dev/null -w "%{http_code}" https://scrymarket.com.au
# Expected: 200

# DB has data
docker compose -f docker-compose.prod.yml exec db \
  psql -U mtg -d mtg_tracker -c \
  "SELECT COUNT(*) FROM store_prices WHERE in_stock = true;"
# Expected: > 0

# No error spikes in logs
docker compose -f docker-compose.prod.yml logs web --since 5m | grep -i error
docker compose -f docker-compose.prod.yml logs scraper --since 5m | grep -i error
```

---

## Specific releases

### Market stats pre-computation (migration 0010)

This adds `scrymarket_price` and `price_trend` to `cards`, and creates the
`market_movers` table. The `market_movers` table and `cards` columns are NULL
until `compute:market-stats` runs after deploy.

Because migration 0010 itself was fixed in this release (idempotent SQL +
corrected journal timestamp), `db:migrate` must be run from the **new** image:

```bash
# Build first, then migrate
docker compose -f docker-compose.prod.yml build scraper
docker compose -f docker-compose.prod.yml run --rm scraper \
  pnpm --filter @mtg-au/scraper db:migrate

# Then rebuild web and start everything
docker compose -f docker-compose.prod.yml build web
docker compose -f docker-compose.prod.yml up -d

# Populate pre-computed market stats immediately
docker compose -f docker-compose.prod.yml run --rm scraper \
  pnpm --filter @mtg-au/scraper compute:market-stats
```

Verify:
```bash
docker compose -f docker-compose.prod.yml exec db \
  psql -U mtg -d mtg_tracker -c \
  "SELECT COUNT(*) AS cards_with_price FROM cards WHERE scrymarket_price IS NOT NULL;
   SELECT COUNT(*) AS movers FROM market_movers;"
# Expected: ~30k cards_with_price, 18 movers
```

---

### set_value_aud column (migration 0009)

This adds `set_value_aud` to the `sets` table. The column is NULL until the first store scrape runs after migration. The `/sets` listing shows "—" until then, which is fine.

1. Pull and migrate (standard release steps)
2. Rebuild and restart — no Scryfall re-import needed
3. Trigger a manual store scrape to populate values immediately:
   ```bash
   docker compose -f docker-compose.prod.yml run --rm scraper \
     pnpm --filter @mtg-au/scraper scrape:stores
   ```
4. Verify:
   ```bash
   docker compose -f docker-compose.prod.yml exec db \
     psql -U mtg -d mtg_tracker -c \
     "SELECT set_code, set_name, set_value_aud FROM sets
      WHERE parent_set_code IS NULL AND set_value_aud IS NOT NULL
      ORDER BY released_at DESC LIMIT 10;"
   ```

---

### sets table + Scryfall import pipeline (migration 0008)

This release adds the `sets` table. `set_type` and `parent_set_code` will be
`NULL` until the first Scryfall import runs — the app handles this gracefully.

1. Pull and migrate (steps above)
2. Rebuild and restart
3. Run Scryfall import manually to populate `set_type` + `parent_set_code`
4. Verify:

```bash
# Parent/child relationships populated
docker compose -f docker-compose.prod.yml exec db \
  psql -U mtg -d mtg_tracker -c \
  "SELECT set_code, set_name, parent_set_code
   FROM sets WHERE parent_set_code IS NOT NULL LIMIT 10;"

# /sets listing excludes promos and tokens
# Visit /sets in browser — no "Promo Pack" or token-only sets should appear
```
