CREATE TABLE "catalog_products" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "product_key" text NOT NULL UNIQUE, "title" text NOT NULL, "description" text,
  "brand" text, "product_type" text, "tags" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "created_at" timestamptz DEFAULT now() NOT NULL, "updated_at" timestamptz DEFAULT now() NOT NULL
);
CREATE TYPE "public"."collection_run_status" AS ENUM('queued','running','succeeded','not_modified','failed');
CREATE TABLE "collection_runs" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL, "source_id" uuid NOT NULL REFERENCES "catalog_sources"("id") ON DELETE CASCADE,
  "status" "collection_run_status" DEFAULT 'queued' NOT NULL, "request_count" numeric(10,0) DEFAULT '0' NOT NULL,
  "error" text, "etag" text, "last_modified" text, "started_at" timestamptz, "completed_at" timestamptz, "created_at" timestamptz DEFAULT now() NOT NULL
);
CREATE TABLE "catalog_variants" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL, "product_id" uuid NOT NULL REFERENCES "catalog_products"("id") ON DELETE CASCADE,
  "variant_key" text NOT NULL UNIQUE, "title" text, "sku" text, "barcode" text,
  "created_at" timestamptz DEFAULT now() NOT NULL, "updated_at" timestamptz DEFAULT now() NOT NULL
);
CREATE TABLE "source_listings" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL, "source_id" uuid NOT NULL REFERENCES "catalog_sources"("id") ON DELETE CASCADE,
  "product_id" uuid NOT NULL REFERENCES "catalog_products"("id") ON DELETE CASCADE, "variant_id" uuid NOT NULL REFERENCES "catalog_variants"("id") ON DELETE CASCADE,
  "listing_key" text NOT NULL UNIQUE, "url" text NOT NULL, "image_url" text,
  "created_at" timestamptz DEFAULT now() NOT NULL, "updated_at" timestamptz DEFAULT now() NOT NULL
);
CREATE TABLE "source_listing_current" (
  "listing_id" uuid PRIMARY KEY REFERENCES "source_listings"("id") ON DELETE CASCADE, "title" text NOT NULL,
  "price" numeric(14,2), "currency" text, "available" boolean NOT NULL, "observed_at" timestamptz NOT NULL, "updated_at" timestamptz DEFAULT now() NOT NULL
);
CREATE TABLE "source_listing_observations" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL, "listing_id" uuid NOT NULL REFERENCES "source_listings"("id") ON DELETE CASCADE,
  "observed_at" timestamptz NOT NULL, "title" text NOT NULL, "price" numeric(14,2), "currency" text, "available" boolean NOT NULL, "evidence_id" uuid
);
CREATE TABLE "source_evidence" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL, "source_id" uuid NOT NULL REFERENCES "catalog_sources"("id") ON DELETE CASCADE, "run_id" uuid NOT NULL REFERENCES "collection_runs"("id") ON DELETE CASCADE,
  "captured_at" timestamptz NOT NULL, "payload" jsonb NOT NULL, "content_type" text, "sha256" text
);
ALTER TABLE "source_listing_observations" ADD CONSTRAINT "source_listing_observations_evidence_fk" FOREIGN KEY ("evidence_id") REFERENCES "source_evidence"("id") ON DELETE SET NULL;
CREATE INDEX "source_listings_source_idx" ON "source_listings" ("source_id");
CREATE INDEX "source_listings_product_idx" ON "source_listings" ("product_id");
CREATE INDEX "source_listing_observations_history_idx" ON "source_listing_observations" ("listing_id", "observed_at");
CREATE UNIQUE INDEX "source_listing_observations_run_unique_idx" ON "source_listing_observations" ("listing_id", "evidence_id");
CREATE UNIQUE INDEX "source_evidence_run_unique_idx" ON "source_evidence" ("run_id");
CREATE UNIQUE INDEX "collection_runs_one_active_per_source_idx" ON "collection_runs" ("source_id") WHERE "status" IN ('queued', 'running');
