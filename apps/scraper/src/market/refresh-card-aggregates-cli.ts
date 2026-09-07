/**
 * Manual entry point for the card-row aggregates.
 *
 * Both passes run nightly on their own (facets after the Scryfall import, prices
 * after the store scrape). This exists for the first run after migration 0017, when
 * every card row still holds the defaults, and for rebuilding after a bulk data fix.
 * Both passes are full recomputes, so running this is always safe and idempotent.
 */

import { refreshCardAggregates } from "./refresh-card-aggregates.js";
import { logger } from "../lib/logger.js";

const log = logger.child({ component: "refresh-card-aggregates-cli" });

refreshCardAggregates()
  .then(() => process.exit(0))
  .catch((err) => {
    log.error({ err }, "Card aggregate refresh failed");
    process.exit(1);
  });
