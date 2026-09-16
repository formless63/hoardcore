CREATE TYPE "public"."catalog_source_status" AS ENUM('not_collected', 'active', 'paused', 'error');--> statement-breakpoint
CREATE TABLE "catalog_sources" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"module_id" text NOT NULL,
	"display_name" text NOT NULL,
	"source_key" text NOT NULL,
	"status" "catalog_source_status" DEFAULT 'not_collected' NOT NULL,
	"config" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "catalog_sources_module_source_key_unique" ON "catalog_sources" USING btree ("module_id","source_key");