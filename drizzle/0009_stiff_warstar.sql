ALTER TABLE "user" ADD COLUMN "install_packages_windows" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "install_packages_linux" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "startup_script_windows" text;--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "startup_script_windows_run_as_admin" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "startup_script_linux" text;--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "startup_script_linux_run_as_admin" boolean DEFAULT true NOT NULL;