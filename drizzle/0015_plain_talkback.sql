ALTER TABLE "catalog_sources" ADD COLUMN "schedule_cron" text;--> statement-breakpoint
ALTER TABLE "catalog_sources" ADD COLUMN "schedule_timezone" text DEFAULT 'UTC' NOT NULL;