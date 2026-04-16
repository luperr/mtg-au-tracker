CREATE TABLE IF NOT EXISTS "market_movers" (
	"id" serial PRIMARY KEY NOT NULL,
	"window_days" integer NOT NULL,
	"direction" text NOT NULL,
	"rank" integer NOT NULL,
	"card_id" text NOT NULL,
	"set_code" text NOT NULL,
	"set_name" text NOT NULL,
	"name" text NOT NULL,
	"slug" text,
	"image_uri" text,
	"start_price" numeric NOT NULL,
	"current_price" numeric NOT NULL,
	"pct_change" numeric NOT NULL,
	"computed_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "cards" ADD COLUMN IF NOT EXISTS "scrymarket_price" numeric;--> statement-breakpoint
ALTER TABLE "cards" ADD COLUMN IF NOT EXISTS "price_trend" text;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "market_movers" ADD CONSTRAINT "market_movers_card_id_cards_id_fk" FOREIGN KEY ("card_id") REFERENCES "public"."cards"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "market_movers_unique_idx" ON "market_movers" USING btree ("window_days","direction","rank");
