ALTER TABLE "cards" ADD COLUMN "cheapest_price_aud" numeric;--> statement-breakpoint
ALTER TABLE "cards" ADD COLUMN "in_stock_store_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "cards" ADD COLUMN "printing_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "cards" ADD COLUMN "primary_image_uri" text;--> statement-breakpoint
ALTER TABLE "cards" ADD COLUMN "facets" text[] DEFAULT '{}' NOT NULL;--> statement-breakpoint
CREATE INDEX "cards_facets_idx" ON "cards" USING gin ("facets");--> statement-breakpoint
CREATE INDEX "cards_cheapest_price_idx" ON "cards" USING btree ("cheapest_price_aud") WHERE "cards"."cheapest_price_aud" IS NOT NULL;