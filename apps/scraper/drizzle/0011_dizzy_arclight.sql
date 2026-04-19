ALTER TABLE "printings" ADD COLUMN "finish" text DEFAULT 'nonfoil' NOT NULL;--> statement-breakpoint
ALTER TABLE "printings" ADD COLUMN "border_color" text;--> statement-breakpoint
ALTER TABLE "printings" ADD COLUMN "frame_effects" text[] DEFAULT '{}' NOT NULL;--> statement-breakpoint
UPDATE "printings" SET "finish" = 'foil' WHERE "is_foil" = true;