-- Enable pg_trgm for trigram-based fuzzy text search.
-- This powers the autocomplete search on the frontend.
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Create a GIN index on normalized card names for fast similarity lookups.
-- This will be applied after Drizzle creates the tables.
-- We run it here so it's available from first boot.
-- If the table doesn't exist yet, this will fail silently and
-- we'll create the index via a migration later.
DO $$
BEGIN
  CREATE INDEX IF NOT EXISTS cards_name_trgm_idx
    ON cards USING gin (name_normalized gin_trgm_ops);
EXCEPTION
  WHEN undefined_table THEN NULL;
END $$;
