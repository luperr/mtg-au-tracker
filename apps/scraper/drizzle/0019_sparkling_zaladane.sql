ALTER TABLE "printings" ADD COLUMN "frame" text;--> statement-breakpoint
ALTER TABLE "printings" ADD COLUMN "full_art" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "printings" ADD COLUMN "promo_types" text[] DEFAULT '{}' NOT NULL;--> statement-breakpoint
ALTER TABLE "printings" ADD COLUMN "treatment" text DEFAULT 'normal' NOT NULL;