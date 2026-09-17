ALTER TABLE "catalog_sources" ADD COLUMN "collection_enabled" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "catalog_sources" ADD COLUMN "schedule_hours" integer;--> statement-breakpoint
ALTER TABLE "catalog_sources" ADD COLUMN "schedule_request_limit" integer DEFAULT 10 NOT NULL;--> statement-breakpoint
ALTER TABLE "catalog_sources" ADD COLUMN "next_run_at" timestamp with time zone;