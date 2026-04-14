-- Add image_uri_back to printings for double-faced card (DFC) back face images.
-- Null for normal (single-faced) cards. Populated by the Scryfall bulk import.
ALTER TABLE "printings" ADD COLUMN "image_uri_back" text;
