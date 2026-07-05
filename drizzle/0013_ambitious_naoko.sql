CREATE TYPE "public"."repo_setup_status" AS ENUM('pending', 'analyzing', 'analyzed', 'running', 'done', 'failed');--> statement-breakpoint
CREATE TABLE "repo_setups" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "repo_setups_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"user_id" text NOT NULL,
	"ysws_id" text,
	"vm_session_id" integer,
	"repo_url" text NOT NULL,
	"status" "repo_setup_status" DEFAULT 'pending' NOT NULL,
	"setup_script" text,
	"reviewer_guide" text,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "repo_setups" ADD CONSTRAINT "repo_setups_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "repo_setups" ADD CONSTRAINT "repo_setups_ysws_id_ysws_id_fk" FOREIGN KEY ("ysws_id") REFERENCES "public"."ysws"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "repo_setups" ADD CONSTRAINT "repo_setups_vm_session_id_vm_sessions_id_fk" FOREIGN KEY ("vm_session_id") REFERENCES "public"."vm_sessions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "repo_setups_user_status_idx" ON "repo_setups" USING btree ("user_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "repo_setups_vm_session_idx" ON "repo_setups" USING btree ("vm_session_id");