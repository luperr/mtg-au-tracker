CREATE TABLE "sets" (
	"set_code" text PRIMARY KEY NOT NULL,
	"set_name" text NOT NULL,
	"set_type" text,
	"parent_set_code" text,
	"released_at" date NOT NULL,
	"card_count" integer DEFAULT 0 NOT NULL,
	"icon_svg_uri" text
);

-- Backfill from existing printings so the table isn't empty before the first
-- Scryfall re-import. set_type and parent_set_code will be NULL until then.
INSERT INTO "sets" (set_code, set_name, released_at)
SELECT DISTINCT ON (set_code) set_code, set_name, MIN(released_at)
FROM printings
GROUP BY set_code, set_name
ON CONFLICT DO NOTHING;
