ALTER TABLE "user" ADD COLUMN "wallpaper_image" "bytea";--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "wallpaper_mime" text;--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "wallpaper_updated_at" timestamp with time zone;