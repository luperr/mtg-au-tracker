-- Pre-aggregated daily price per (set, card), replacing the live price_history
-- aggregation the set pages used to run on every request. price_history carries no
-- set_code, so a single-set filter had to scan all ~18GB of it; this table holds the
-- same aggregate keyed by set_code so a set page touches only its own rows.
CREATE TABLE IF NOT EXISTS "set_card_daily" (
	"set_code" text NOT NULL,
	"card_id" text NOT NULL,
	"recorded_at" date NOT NULL,
	"min_price" numeric NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "set_card_daily" ADD CONSTRAINT "set_card_daily_card_id_cards_id_fk" FOREIGN KEY ("card_id") REFERENCES "public"."cards"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "set_card_daily_unique_idx" ON "set_card_daily" USING btree ("set_code","recorded_at","card_id");
