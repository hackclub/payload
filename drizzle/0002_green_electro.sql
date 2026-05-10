CREATE TYPE "public"."vm_session_state" AS ENUM('pending', 'provisioning', 'ready', 'active', 'terminating', 'terminated', 'errored');--> statement-breakpoint
CREATE TABLE "vm_session_events" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "vm_session_events_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"vm_session_id" integer NOT NULL,
	"kind" text NOT NULL,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "vm_sessions" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "vm_sessions_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"user_id" text NOT NULL,
	"vm_type_id" integer NOT NULL,
	"state" "vm_session_state" DEFAULT 'pending' NOT NULL,
	"proxmox_vmid" integer,
	"proxmox_node" text,
	"vm_ip" text,
	"vm_credential_ciphertext" text,
	"guacamole_connection_id" text,
	"guacamole_username" text,
	"guacamole_password_ciphertext" text,
	"expires_at" timestamp with time zone NOT NULL,
	"last_heartbeat_at" timestamp with time zone,
	"terminated_at" timestamp with time zone,
	"termination_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "vm_session_events" ADD CONSTRAINT "vm_session_events_vm_session_id_vm_sessions_id_fk" FOREIGN KEY ("vm_session_id") REFERENCES "public"."vm_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vm_sessions" ADD CONSTRAINT "vm_sessions_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vm_sessions" ADD CONSTRAINT "vm_sessions_vm_type_id_vm_types_id_fk" FOREIGN KEY ("vm_type_id") REFERENCES "public"."vm_types"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "vm_sessions_user_state_idx" ON "vm_sessions" USING btree ("user_id","state");--> statement-breakpoint
CREATE INDEX "vm_sessions_state_expires_idx" ON "vm_sessions" USING btree ("state","expires_at");--> statement-breakpoint
CREATE INDEX "vm_sessions_state_heartbeat_idx" ON "vm_sessions" USING btree ("state","last_heartbeat_at");--> statement-breakpoint
CREATE UNIQUE INDEX "vm_sessions_proxmox_vmid_idx" ON "vm_sessions" USING btree ("proxmox_vmid");