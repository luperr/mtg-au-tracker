-- card_listings: store_prices in card order. Hand-written so the table is filled before web restarts
-- (deploy.sh migrates first), and so it matches what rebuildCardListings() (market/card-listings.ts)
-- builds every night. CREATE TABLE AS writes pages strictly in sort order; an INSERT backfills later
-- rows into earlier pages' tails and runs about twice as slow. The resulting columns and index are
-- exactly drizzle's snapshot for `cardListings` in schema.ts.
-- The sort is ~250MB; give it the memory to stay off disk.
SET LOCAL work_mem = '256MB';
--> statement-breakpoint
CREATE TABLE "card_listings" AS
SELECT p.card_id, sp.id, sp.printing_id, sp.store_id, sp.price_aud, sp.shipping_aud, sp.price_type, sp.condition, sp.in_stock, sp.url, sp.scraped_at
FROM store_prices sp
JOIN printings p ON p.id = sp.printing_id
ORDER BY p.card_id, sp.printing_id, sp.id;
--> statement-breakpoint
ALTER TABLE "card_listings"
	ALTER COLUMN "card_id" SET NOT NULL, ALTER COLUMN "id" SET NOT NULL,
	ALTER COLUMN "printing_id" SET NOT NULL, ALTER COLUMN "store_id" SET NOT NULL,
	ALTER COLUMN "price_aud" SET NOT NULL, ALTER COLUMN "price_type" SET NOT NULL,
	ALTER COLUMN "in_stock" SET NOT NULL, ALTER COLUMN "scraped_at" SET NOT NULL;
--> statement-breakpoint
CREATE INDEX "card_listings_card_printing_idx" ON "card_listings" USING btree ("card_id","printing_id");
--> statement-breakpoint
ANALYZE "card_listings";
