CREATE TYPE "public"."ysws_role" AS ENUM('member', 'admin');--> statement-breakpoint
CREATE TABLE "platform_superadmins" (
	"slack_id" text PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ysws" (
	"id" text PRIMARY KEY NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"max_concurrent_vms" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ysws_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "ysws_memberships" (
	"ysws_id" text NOT NULL,
	"slack_id" text NOT NULL,
	"role" "ysws_role" DEFAULT 'member' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ysws_memberships_ysws_id_slack_id_pk" PRIMARY KEY("ysws_id","slack_id")
);
--> statement-breakpoint
ALTER TABLE "vm_sessions" ADD COLUMN "ysws_id" text;--> statement-breakpoint
ALTER TABLE "ysws_memberships" ADD CONSTRAINT "ysws_memberships_ysws_id_ysws_id_fk" FOREIGN KEY ("ysws_id") REFERENCES "public"."ysws"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ysws_memberships_slack_idx" ON "ysws_memberships" USING btree ("slack_id");--> statement-breakpoint
ALTER TABLE "vm_sessions" ADD CONSTRAINT "vm_sessions_ysws_id_ysws_id_fk" FOREIGN KEY ("ysws_id") REFERENCES "public"."ysws"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "vm_sessions_ysws_state_idx" ON "vm_sessions" USING btree ("ysws_id","state");--> statement-breakpoint
-- Data backfill (ADR-0036): fold the old flat lists into a seeded Legacy
-- workspace before 0012 drops reviewer_allowlist_entries / admin_entries.
INSERT INTO "ysws" ("id", "slug", "name", "enabled") VALUES ('00000000-0000-0000-0000-000000000001', 'legacy', 'Legacy', true) ON CONFLICT ("slug") DO NOTHING;--> statement-breakpoint
INSERT INTO "ysws_memberships" ("ysws_id", "slack_id", "role") SELECT '00000000-0000-0000-0000-000000000001', "slack_id", 'member' FROM "reviewer_allowlist_entries" ON CONFLICT DO NOTHING;--> statement-breakpoint
INSERT INTO "platform_superadmins" ("slack_id") SELECT "slack_id" FROM "admin_entries" ON CONFLICT DO NOTHING;--> statement-breakpoint
INSERT INTO "ysws_memberships" ("ysws_id", "slack_id", "role") SELECT '00000000-0000-0000-0000-000000000001', "slack_id", 'admin' FROM "admin_entries" ON CONFLICT ("ysws_id","slack_id") DO UPDATE SET "role" = 'admin';--> statement-breakpoint
UPDATE "vm_sessions" SET "ysws_id" = '00000000-0000-0000-0000-000000000001' WHERE "user_id" IS NOT NULL;