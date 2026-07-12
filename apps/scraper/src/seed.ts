/**
 * Seed the stores table from STORE_REGISTRY (stores.config.ts).
 *
 * Safe to re-run — upserts by id, updating name/baseUrl/scraperEnabled/flatShippingAud
 * if the row already exists. This means re-running seed will pick up any changes there.
 *
 * Run with: docker compose run --rm dev pnpm --filter @mtg-au/scraper seed
 */

import { fileURLToPath } from "url";
import { sql } from "drizzle-orm";
import { db, schema } from "./lib/db.js";
import { logger } from "./lib/logger.js";
import { STORE_REGISTRY } from "./stores/stores.config.js";

const log = logger.child({ component: "seed" });

export async function seedStores(): Promise<void> {
  log.info("Seeding stores");

  const rows = STORE_REGISTRY.map((s) => ({
    id: s.id,
    name: s.name,
    baseUrl: s.baseUrl,
    scraperEnabled: s.scraperEnabled,
    logoUrl: s.logoUrl,
    flatShippingAud: s.flatShippingAud === null ? null : s.flatShippingAud.toFixed(2),
  }));

  await db
    .insert(schema.stores)
    .values(rows)
    .onConflictDoUpdate({
      target: schema.stores.id,
      set: {
        name: sql`excluded.name`,
        baseUrl: sql`excluded.base_url`,
        scraperEnabled: sql`excluded.scraper_enabled`,
        logoUrl: sql`excluded.logo_url`,
        flatShippingAud: sql`excluded.flat_shipping_aud`,
      },
    });

  log.info({ count: rows.length }, "Stores upserted");
}

async function main() {
  await seedStores();
  process.exit(0);
}

// Only run when invoked directly (pnpm --filter @mtg-au/scraper seed),
// not when seedStores() is imported by run-all.ts or index.ts.
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((err) => {
    log.fatal({ err }, "Seed failed");
    process.exit(1);
  });
}
