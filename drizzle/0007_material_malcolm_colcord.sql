ALTER TYPE "public"."vm_session_state" ADD VALUE 'warm' BEFORE 'pending';--> statement-breakpoint
ALTER TABLE "vm_sessions" ALTER COLUMN "user_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "vm_sessions" ALTER COLUMN "expires_at" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "vm_sessions" ADD COLUMN "claimed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "vm_types" ADD COLUMN "warm_pool_size" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "vm_types" ADD COLUMN "memory_mb" integer DEFAULT 4096 NOT NULL;--> statement-breakpoint
ALTER TABLE "vm_types" ADD COLUMN "expensive" boolean DEFAULT false NOT NULL;--> statement-breakpoint
CREATE INDEX "vm_sessions_state_type_idx" ON "vm_sessions" USING btree ("state","vm_type_id");