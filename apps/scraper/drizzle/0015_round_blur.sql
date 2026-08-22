-- Probe-cache state, moved out of JSON files on the scraper's local disk.
--
-- db:generate also re-emitted set_card_daily and cards_name_trgm_idx here: 0013 and
-- 0014 were hand-written, so drizzle's snapshot had never seen them and diffed them
-- as missing. Those statements are removed — the objects already exist in prod, and
-- unlike the hand-written originals the generated versions carry no IF NOT EXISTS,
-- so running them would abort the migration. The 0015 snapshot now records all
-- three, so future diffs are clean.
CREATE TABLE "scraper_cache" (
	"key" text PRIMARY KEY NOT NULL,
	"last_full_scan_at" timestamp NOT NULL,
	"valid_keys" jsonb NOT NULL
);
