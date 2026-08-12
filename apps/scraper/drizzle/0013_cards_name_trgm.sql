-- Trigram index to support the leading-wildcard ILIKE in searchCards()/countCards().
-- Without it, a selective query like '%bolt%' scans all of `cards` (~6.9k buffers);
-- with it, the same search reads ~226. Broad queries ('%a%') still use cards_name_idx,
-- which the planner picks on cost.
CREATE EXTENSION IF NOT EXISTS pg_trgm;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "cards_name_trgm_idx" ON "cards" USING gin ("name" gin_trgm_ops);
