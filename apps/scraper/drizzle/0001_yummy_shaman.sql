CREATE TABLE "ebay_search_log" (
	"card_name" text PRIMARY KEY NOT NULL,
	"last_searched_at" date NOT NULL,
	"last_result_count" integer DEFAULT 0 NOT NULL
);
