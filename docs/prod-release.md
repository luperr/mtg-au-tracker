# Scrymarket — Production Release Guide

## Pre-release checklist

- [ ] Branch is merged to `main`
- [ ] `pnpm --filter @mtg-au/web build` passes locally (no type errors)
- [ ] Any new migrations were generated with `db:generate` (NOT hand-written) — hand-written SQL files are silently skipped by `drizzle-kit migrate` because they won't appear in `drizzle/meta/_journal.json`
- [ ] `drizzle/meta/_journal.json` entry count matches the number of `.sql` files in `drizzle/`: `ls apps/scraper/drizzle/*.sql | wc -l` should equal the number of `entries` in the journal
- [ ] `.env.example` updated if new env vars were added
- [ ] `docker-quick-ref.md` updated if new manual commands are needed

---

## How deploys work now

Images are **built and pushed to GHCR by GitHub Actions** on every merge to `main`
(`.github/workflows/deploy-images.yml`) — the server never builds. Deploying is a
**pull**, driven by `scripts/deploy.sh`.

Image references in `docker-compose.prod.yml` are registry-agnostic:

| Var | Default | Purpose |
|---|---|---|
| `IMAGE_REGISTRY` | `ghcr.io/luperr` | Registry + namespace. Single lever for a future ECR swap. |
| `IMAGE_TAG` | `latest` | Which image to run. Set to `main-<sha>` to pin or roll back. |

Both are optional (inline defaults in the compose file); `deploy.sh` sets `IMAGE_TAG`
for you from its first argument.

**One-time GHCR access:** the `scrymarket-scraper` / `scrymarket-web` packages must be
readable by the server. Simplest is to set both packages to **public** visibility in the
repo's GitHub Packages settings (they're just compiled artifacts). If you keep them
private, run once on the server:
`echo <PAT-with-read:packages> | docker login ghcr.io -u luperr --password-stdin`.

---

## Standard release (code changes only, no migration)

```bash
# On the server (repo checkout at /opt/mtg-au-tracker):
./scripts/deploy.sh
```

That's it — `deploy.sh` runs `git pull` (to refresh the compose file + migration SQL),
`docker compose pull web scraper`, `db:migrate`, then `up -d` and prints `ps`. Then:

```bash
docker compose -f docker-compose.prod.yml logs web --tail=50
docker compose -f docker-compose.prod.yml logs scraper --tail=50
```

---

## Release with a DB migration

`deploy.sh` **already runs `db:migrate` before `up -d`** on every deploy — the migration
applies while the old web container keeps serving the old schema, then services restart.
So a migration release is the same `./scripts/deploy.sh`. The migration SQL is baked into
the pulled scraper image, so there is no "rebuild first" caveat anymore — the pulled image
*is* the fixed image.

For a migration you want to eyeball before restarting, run the steps by hand:

```bash
cd /opt/mtg-au-tracker
git pull --ff-only
export IMAGE_TAG=latest   # or main-<sha>

# 1. Pull the new images
docker compose -f docker-compose.prod.yml pull web scraper

# 2. Apply migration (safe against live DB)
docker compose -f docker-compose.prod.yml run --rm scraper \
  pnpm --filter @mtg-au/scraper db:migrate

# 3. Confirm migration applied
docker compose -f docker-compose.prod.yml exec db \
  psql -U mtg -d mtg_tracker -c \
  "SELECT version, created_at FROM drizzle.__drizzle_migrations ORDER BY created_at DESC LIMIT 5;"

# 4. Restart
docker compose -f docker-compose.prod.yml up -d
docker compose -f docker-compose.prod.yml ps
```

---

## Emergency: build on the server

Building on the server is no longer the deploy path, but the `build:` blocks remain in
`docker-compose.prod.yml` as a fallback (e.g. GHCR is down). To use it:

```bash
docker compose -f docker-compose.prod.yml build web scraper
docker compose -f docker-compose.prod.yml up -d
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

Re-deploy the previous image tag — no rebuild, no revert commit needed. Find the prior
`main-<sha>` tag under the repo's GitHub Packages (or from the earlier deploy log):

```bash
./scripts/deploy.sh main-abc1234
```

`deploy.sh` still runs `db:migrate` on rollback; that's a no-op if the older image's
migrations are already applied. Only revert the code in git if the bad change also needs
backing out of `main`.

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

### Card page variant filtering — finish / border_color / frame_effects (migration 0011)

This adds `finish`, `border_color`, `frame_effects` to `printings`, and reworks the Scryfall import to produce separate printing rows per finish (`UUID` for nonfoil, `UUID_foil` for foil). The Variant filter on the card detail page needs these columns populated to show Borderless, Showcase, Extended Art etc. — until the Scryfall import runs it will only show Standard / Foil.

Because the migration touches `printings` (large table), run it before rebuilding so the web container keeps serving the old schema while migration applies.

```bash
cd /opt/mtg-au-tracker

# 1. Pull latest (ensure on main after merge)
git pull

# 2. DB backup before touching printings
docker compose -f docker-compose.prod.yml exec db \
  pg_dump -U mtg mtg_tracker > mtg_tracker_backup_$(date +%Y%m%d_%H%M).sql

# 3. Migrate (run from current scraper image — no rebuild needed first,
#    0011 is a pure ADD COLUMN with defaults, safe against live traffic)
docker compose -f docker-compose.prod.yml run --rm scraper \
  pnpm --filter @mtg-au/scraper db:migrate

# 4. Confirm columns exist
docker compose -f docker-compose.prod.yml exec db \
  psql -U mtg -d mtg_tracker -c \
  "\d printings" | grep -E "finish|border_color|frame_effects"
# Expected: three rows — finish text not null default 'nonfoil', border_color text, frame_effects text[]

# 5. Rebuild and restart
docker compose -f docker-compose.prod.yml build web scraper
docker compose -f docker-compose.prod.yml up -d

# 6. Run Scryfall import to populate border_color + frame_effects
#    (~10-15 min, runs in foreground)
docker compose -f docker-compose.prod.yml run --rm scraper \
  pnpm --filter @mtg-au/scraper import:scryfall

# 7. Verify
docker compose -f docker-compose.prod.yml exec db \
  psql -U mtg -d mtg_tracker -c \
  "SELECT finish, COUNT(*) FROM printings GROUP BY finish ORDER BY 2 DESC;
   SELECT COUNT(*) FILTER (WHERE border_color IS NOT NULL AND border_color != '') AS has_border_color,
          COUNT(*) FILTER (WHERE frame_effects != '{}') AS has_frame_effects FROM printings;"
# Expected: nonfoil ~83k, foil ~60k; has_border_color + has_frame_effects both > 0
```

> **Note on OOM:** the Scryfall import is memory-hungry (~2GB heap peak). `NODE_OPTIONS=--max-old-space-size=4096` is already set in the scraper's prod environment — no extra steps needed.

---

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
