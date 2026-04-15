/**
 * One-shot script: compute set_value_aud from current store_prices and write
 * to sets table. Does NOT scrape any stores — uses whatever is already in DB.
 *
 * Run: pnpm --filter @mtg-au/scraper compute:set-values
 */
import { fileURLToPath } from "url";
import { updateSetValues } from "./update-set-values.js";
import { logger } from "../lib/logger.js";

const log = logger.child({ component: "compute-set-values" });

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  updateSetValues()
    .then(() => { log.info("Done"); process.exit(0); })
    .catch((err) => { log.fatal({ err }, "Failed"); process.exit(1); });
}
