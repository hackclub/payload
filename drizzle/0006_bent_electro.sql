CREATE TABLE "admin_entries" (
	"slack_id" text PRIMARY KEY NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
