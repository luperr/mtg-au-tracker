CREATE TABLE "card_searches" (
	"id" serial PRIMARY KEY NOT NULL,
	"card_id" text,
	"query" text NOT NULL,
	"searched_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "card_searches" ADD CONSTRAINT "card_searches_card_id_cards_id_fk" FOREIGN KEY ("card_id") REFERENCES "public"."cards"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "card_searches_card_id_idx" ON "card_searches" USING btree ("card_id");--> statement-breakpoint
CREATE INDEX "card_searches_searched_at_idx" ON "card_searches" USING btree ("searched_at");