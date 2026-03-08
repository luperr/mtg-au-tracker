CREATE TABLE "cards" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"mana_cost" text,
	"type_line" text NOT NULL,
	"oracle_text" text,
	"colors" text[] DEFAULT '{}' NOT NULL,
	"color_identity" text[] DEFAULT '{}' NOT NULL,
	"legalities" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "price_history" (
	"id" serial PRIMARY KEY NOT NULL,
	"printing_id" text NOT NULL,
	"store_id" text NOT NULL,
	"price_aud" text NOT NULL,
	"price_type" text NOT NULL,
	"recorded_at" date NOT NULL
);
--> statement-breakpoint
CREATE TABLE "printings" (
	"id" text PRIMARY KEY NOT NULL,
	"card_id" text NOT NULL,
	"set_code" text NOT NULL,
	"set_name" text NOT NULL,
	"released_at" date DEFAULT '1993-01-01' NOT NULL,
	"collector_number" text NOT NULL,
	"rarity" text NOT NULL,
	"is_foil" boolean DEFAULT false NOT NULL,
	"image_uri" text,
	"scryfall_uri" text NOT NULL,
	"usd_price" text,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "store_prices" (
	"id" serial PRIMARY KEY NOT NULL,
	"printing_id" text NOT NULL,
	"store_id" text NOT NULL,
	"price_aud" text NOT NULL,
	"price_type" text NOT NULL,
	"condition" text,
	"in_stock" boolean DEFAULT true NOT NULL,
	"url" text,
	"scraped_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "stores" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"base_url" text NOT NULL,
	"scraper_enabled" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "unmatched_cards" (
	"id" serial PRIMARY KEY NOT NULL,
	"store_id" text NOT NULL,
	"raw_name" text NOT NULL,
	"raw_set_name" text,
	"raw_price" text,
	"source_url" text,
	"scraped_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "price_history" ADD CONSTRAINT "price_history_printing_id_printings_id_fk" FOREIGN KEY ("printing_id") REFERENCES "public"."printings"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "price_history" ADD CONSTRAINT "price_history_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "printings" ADD CONSTRAINT "printings_card_id_cards_id_fk" FOREIGN KEY ("card_id") REFERENCES "public"."cards"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "store_prices" ADD CONSTRAINT "store_prices_printing_id_printings_id_fk" FOREIGN KEY ("printing_id") REFERENCES "public"."printings"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "store_prices" ADD CONSTRAINT "store_prices_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "unmatched_cards" ADD CONSTRAINT "unmatched_cards_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "cards_name_idx" ON "cards" USING btree ("name");--> statement-breakpoint
CREATE UNIQUE INDEX "price_history_unique_daily_idx" ON "price_history" USING btree ("printing_id","store_id","price_type","recorded_at");--> statement-breakpoint
CREATE INDEX "price_history_recorded_at_idx" ON "price_history" USING btree ("recorded_at");--> statement-breakpoint
CREATE INDEX "printings_card_id_idx" ON "printings" USING btree ("card_id");--> statement-breakpoint
CREATE INDEX "printings_set_code_idx" ON "printings" USING btree ("set_code");--> statement-breakpoint
CREATE INDEX "store_prices_printing_store_idx" ON "store_prices" USING btree ("printing_id","store_id");--> statement-breakpoint
CREATE INDEX "store_prices_store_id_idx" ON "store_prices" USING btree ("store_id");--> statement-breakpoint
CREATE INDEX "unmatched_cards_store_id_idx" ON "unmatched_cards" USING btree ("store_id");