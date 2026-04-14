ALTER TABLE "cards" ADD COLUMN "slug" text;--> statement-breakpoint
CREATE UNIQUE INDEX "cards_slug_idx" ON "cards" USING btree ("slug");