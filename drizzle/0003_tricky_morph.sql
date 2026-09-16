ALTER TYPE "public"."collection_run_status" ADD VALUE 'partial' BEFORE 'not_modified';--> statement-breakpoint
CREATE TABLE "collection_run_events" (
	"id" serial PRIMARY KEY NOT NULL,
	"run_id" uuid NOT NULL,
	"message" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "collection_runs" ADD COLUMN "request_limit" integer DEFAULT 3 NOT NULL;--> statement-breakpoint
ALTER TABLE "collection_runs" ADD COLUMN "page_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "collection_runs" ADD COLUMN "product_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "collection_run_events" ADD CONSTRAINT "collection_run_events_run_id_collection_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."collection_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "collection_run_events_run_idx" ON "collection_run_events" USING btree ("run_id","id");