CREATE TABLE "card_listings" (
	"card_id" text NOT NULL,
	"id" integer NOT NULL,
	"printing_id" text NOT NULL,
	"store_id" text NOT NULL,
	"price_aud" text NOT NULL,
	"shipping_aud" text,
	"price_type" text NOT NULL,
	"condition" text,
	"in_stock" boolean NOT NULL,
	"url" text,
	"scraped_at" timestamp NOT NULL
);
--> statement-breakpoint
-- Initial fill, in card order, so the web never finds it empty: migrations run before web restarts
-- (deploy.sh). Hand-added; after this, rebuildCardListings() (market/card-listings.ts) refreshes it.
-- The sort is ~250MB; give it the memory to stay off disk.
SET LOCAL work_mem = '256MB';
--> statement-breakpoint
INSERT INTO "card_listings" (card_id, id, printing_id, store_id, price_aud, shipping_aud, price_type, condition, in_stock, url, scraped_at)
SELECT p.card_id, sp.id, sp.printing_id, sp.store_id, sp.price_aud, sp.shipping_aud, sp.price_type, sp.condition, sp.in_stock, sp.url, sp.scraped_at
FROM store_prices sp
JOIN printings p ON p.id = sp.printing_id
ORDER BY p.card_id, sp.printing_id, sp.id;
--> statement-breakpoint
-- After the fill: one index build is far cheaper than maintaining it row by row.
CREATE INDEX "card_listings_card_printing_idx" ON "card_listings" USING btree ("card_id","printing_id");
--> statement-breakpoint
ANALYZE "card_listings";
