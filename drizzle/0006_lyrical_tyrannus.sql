CREATE TYPE "public"."research_comparable_evidence_type" AS ENUM('active_asking', 'completed_sale', 'retail_offer');--> statement-breakpoint
CREATE TYPE "public"."research_submission_status" AS ENUM('valid', 'partial', 'invalid');--> statement-breakpoint
CREATE TYPE "public"."media_capture_run_status" AS ENUM('queued', 'running', 'succeeded', 'partial', 'failed');--> statement-breakpoint
CREATE TYPE "public"."notification_delivery_status" AS ENUM('queued', 'sent', 'failed');--> statement-breakpoint
CREATE TABLE "research_api_tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"name" text NOT NULL,
	"token_hash" text NOT NULL,
	"scopes" jsonb NOT NULL,
	"expires_at" timestamp with time zone,
	"last_used_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "research_api_tokens_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE "research_batches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"packet_id" text NOT NULL,
	"created_by_user_id" text NOT NULL,
	"packet" jsonb NOT NULL,
	"prompt" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "research_batches_packet_id_unique" UNIQUE("packet_id")
);
--> statement-breakpoint
CREATE TABLE "research_comparables" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"submission_id" uuid NOT NULL,
	"source_listing_id" uuid,
	"product_id" uuid,
	"variant_id" uuid,
	"comparable_id" text NOT NULL,
	"channel" text NOT NULL,
	"evidence_type" "research_comparable_evidence_type" NOT NULL,
	"price" numeric(14, 2) NOT NULL,
	"shipping" numeric(14, 2),
	"currency" text NOT NULL,
	"condition" text,
	"observed_at" timestamp with time zone,
	"sold_at" timestamp with time zone,
	"sample_size" integer,
	"sample_window" text,
	"url" text,
	"citation_id" text,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "research_submissions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"batch_id" uuid NOT NULL,
	"submitted_by_user_id" text NOT NULL,
	"result_id" text NOT NULL,
	"status" "research_submission_status" NOT NULL,
	"raw_payload" text NOT NULL,
	"normalized_payload" jsonb,
	"diagnostics" jsonb NOT NULL,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "listing_media" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"listing_id" uuid NOT NULL,
	"source_url" text NOT NULL,
	"source_sha256" text NOT NULL,
	"source_content_type" text NOT NULL,
	"original_width" integer NOT NULL,
	"original_height" integer NOT NULL,
	"thumbnail_blob_id" uuid NOT NULL,
	"preview_blob_id" uuid NOT NULL,
	"captured_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "media_blobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"sha256" text NOT NULL,
	"content_type" text NOT NULL,
	"width" integer NOT NULL,
	"height" integer NOT NULL,
	"byte_length" integer NOT NULL,
	"data" "bytea" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "media_blobs_sha256_unique" UNIQUE("sha256")
);
--> statement-breakpoint
CREATE TABLE "media_capture_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source_id" uuid NOT NULL,
	"status" "media_capture_run_status" DEFAULT 'queued' NOT NULL,
	"request_limit" integer DEFAULT 10 NOT NULL,
	"request_count" integer DEFAULT 0 NOT NULL,
	"captured_count" integer DEFAULT 0 NOT NULL,
	"error" text,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "watched_listings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"listing_id" uuid NOT NULL,
	"alerts_enabled" boolean DEFAULT false NOT NULL,
	"event_types" jsonb DEFAULT '["new_match","price_change","availability_change"]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notification_deliveries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"listing_id" uuid NOT NULL,
	"observation_id" uuid,
	"saved_view_id" uuid,
	"kind" text NOT NULL,
	"event_type" text NOT NULL,
	"dedupe_key" text NOT NULL,
	"payload" jsonb NOT NULL,
	"status" "notification_delivery_status" DEFAULT 'queued' NOT NULL,
	"error" text,
	"attempt_count" integer DEFAULT 0 NOT NULL,
	"next_attempt_at" timestamp with time zone,
	"attempted_at" timestamp with time zone,
	"sent_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notification_settings" (
	"user_id" text PRIMARY KEY NOT NULL,
	"enabled" boolean DEFAULT false NOT NULL,
	"endpoint" text DEFAULT 'https://ntfy.sh' NOT NULL,
	"topic" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "saved_view_notification_rules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"saved_view_id" uuid NOT NULL,
	"enabled" boolean DEFAULT false NOT NULL,
	"event_types" jsonb DEFAULT '["new_match","price_change","availability_change"]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "research_api_tokens" ADD CONSTRAINT "research_api_tokens_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "research_batches" ADD CONSTRAINT "research_batches_created_by_user_id_user_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "research_comparables" ADD CONSTRAINT "research_comparables_submission_id_research_submissions_id_fk" FOREIGN KEY ("submission_id") REFERENCES "public"."research_submissions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "research_comparables" ADD CONSTRAINT "research_comparables_source_listing_id_source_listings_id_fk" FOREIGN KEY ("source_listing_id") REFERENCES "public"."source_listings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "research_comparables" ADD CONSTRAINT "research_comparables_product_id_catalog_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."catalog_products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "research_comparables" ADD CONSTRAINT "research_comparables_variant_id_catalog_variants_id_fk" FOREIGN KEY ("variant_id") REFERENCES "public"."catalog_variants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "research_submissions" ADD CONSTRAINT "research_submissions_batch_id_research_batches_id_fk" FOREIGN KEY ("batch_id") REFERENCES "public"."research_batches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "research_submissions" ADD CONSTRAINT "research_submissions_submitted_by_user_id_user_id_fk" FOREIGN KEY ("submitted_by_user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "listing_media" ADD CONSTRAINT "listing_media_listing_id_source_listings_id_fk" FOREIGN KEY ("listing_id") REFERENCES "public"."source_listings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "listing_media" ADD CONSTRAINT "listing_media_thumbnail_blob_id_media_blobs_id_fk" FOREIGN KEY ("thumbnail_blob_id") REFERENCES "public"."media_blobs"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "listing_media" ADD CONSTRAINT "listing_media_preview_blob_id_media_blobs_id_fk" FOREIGN KEY ("preview_blob_id") REFERENCES "public"."media_blobs"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "media_capture_runs" ADD CONSTRAINT "media_capture_runs_source_id_catalog_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."catalog_sources"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "watched_listings" ADD CONSTRAINT "watched_listings_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "watched_listings" ADD CONSTRAINT "watched_listings_listing_id_source_listings_id_fk" FOREIGN KEY ("listing_id") REFERENCES "public"."source_listings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_deliveries" ADD CONSTRAINT "notification_deliveries_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_deliveries" ADD CONSTRAINT "notification_deliveries_listing_id_source_listings_id_fk" FOREIGN KEY ("listing_id") REFERENCES "public"."source_listings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_deliveries" ADD CONSTRAINT "notification_deliveries_observation_id_source_listing_observations_id_fk" FOREIGN KEY ("observation_id") REFERENCES "public"."source_listing_observations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_deliveries" ADD CONSTRAINT "notification_deliveries_saved_view_id_saved_listing_views_id_fk" FOREIGN KEY ("saved_view_id") REFERENCES "public"."saved_listing_views"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_settings" ADD CONSTRAINT "notification_settings_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "saved_view_notification_rules" ADD CONSTRAINT "saved_view_notification_rules_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "saved_view_notification_rules" ADD CONSTRAINT "saved_view_notification_rules_saved_view_id_saved_listing_views_id_fk" FOREIGN KEY ("saved_view_id") REFERENCES "public"."saved_listing_views"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "research_api_tokens_user_created_idx" ON "research_api_tokens" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "research_batches_user_created_idx" ON "research_batches" USING btree ("created_by_user_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "research_comparables_submission_comparable_unique_idx" ON "research_comparables" USING btree ("submission_id","comparable_id");--> statement-breakpoint
CREATE INDEX "research_comparables_listing_created_idx" ON "research_comparables" USING btree ("source_listing_id","created_at");--> statement-breakpoint
CREATE INDEX "research_comparables_variant_created_idx" ON "research_comparables" USING btree ("variant_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "research_submissions_batch_result_unique_idx" ON "research_submissions" USING btree ("batch_id","result_id");--> statement-breakpoint
CREATE INDEX "research_submissions_batch_created_idx" ON "research_submissions" USING btree ("batch_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "listing_media_listing_source_unique_idx" ON "listing_media" USING btree ("listing_id","source_url");--> statement-breakpoint
CREATE INDEX "listing_media_listing_idx" ON "listing_media" USING btree ("listing_id");--> statement-breakpoint
CREATE UNIQUE INDEX "media_capture_runs_one_active_per_source_idx" ON "media_capture_runs" USING btree ("source_id") WHERE "media_capture_runs"."status" in ('queued', 'running');--> statement-breakpoint
CREATE UNIQUE INDEX "watched_listings_user_listing_idx" ON "watched_listings" USING btree ("user_id","listing_id");--> statement-breakpoint
CREATE INDEX "watched_listings_listing_idx" ON "watched_listings" USING btree ("listing_id");--> statement-breakpoint
CREATE UNIQUE INDEX "notification_deliveries_dedupe_idx" ON "notification_deliveries" USING btree ("user_id","dedupe_key");--> statement-breakpoint
CREATE INDEX "notification_deliveries_listing_idx" ON "notification_deliveries" USING btree ("listing_id","created_at");--> statement-breakpoint
CREATE INDEX "notification_deliveries_status_idx" ON "notification_deliveries" USING btree ("status","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "saved_view_notification_rules_view_idx" ON "saved_view_notification_rules" USING btree ("saved_view_id");--> statement-breakpoint
CREATE INDEX "saved_view_notification_rules_user_idx" ON "saved_view_notification_rules" USING btree ("user_id");