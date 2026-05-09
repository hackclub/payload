CREATE TABLE "vm_types" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "vm_types_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"slug" text NOT NULL,
	"display_name" text NOT NULL,
	"proxmox_template_vmid" integer NOT NULL,
	"proxmox_node" text NOT NULL,
	"protocol" text NOT NULL,
	"default_port" integer NOT NULL,
	"enabled" boolean DEFAULT false NOT NULL,
	"description" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "vm_types_slug_unique" UNIQUE("slug")
);
