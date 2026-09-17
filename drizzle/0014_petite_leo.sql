ALTER TABLE "collection_runs" ADD COLUMN "supplement_pages" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "source_listing_current" ADD COLUMN "reappeared_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "source_listing_current" ADD COLUMN "reappeared_run_id" uuid;--> statement-breakpoint
ALTER TABLE "source_listing_current" ADD CONSTRAINT "source_listing_current_reappeared_run_id_collection_runs_id_fk" FOREIGN KEY ("reappeared_run_id") REFERENCES "public"."collection_runs"("id") ON DELETE set null ON UPDATE no action;