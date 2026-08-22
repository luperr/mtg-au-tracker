/**
 * Manual entry point for the set_card_daily backfill.
 *
 * Exists separately from compute-market-stats.ts's CLI entry point because that one
 * runs all four passes, including the two whole-table ones that are paused for good
 * reason. This runs only the incremental pass.
 *
 * The first run against an empty table works through every date in price_history —
 * on production that is ~162 dates of ~764k rows each, so budget hours, not minutes,
 * and run it overnight. It is resumable: refreshSetCardDaily() starts from
 * MAX(recorded_at) in set_card_daily, so an interrupted run picks up where it stopped.
 */

import { refreshSetCardDaily } from "./compute-market-stats.js";
import { logger } from "../lib/logger.js";

const log = logger.child({ component: "refresh-set-card-daily" });

refreshSetCardDaily()
  .then(() => process.exit(0))
  .catch((err) => {
    log.error({ err }, "set_card_daily refresh failed");
    process.exit(1);
  });
