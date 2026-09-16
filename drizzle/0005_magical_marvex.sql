CREATE TABLE "saved_listing_views" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"name" text NOT NULL,
	"filters" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "catalog_products" ADD COLUMN "image_urls" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "saved_listing_views" ADD CONSTRAINT "saved_listing_views_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "saved_listing_views_user_name_idx" ON "saved_listing_views" USING btree ("user_id","name");--> statement-breakpoint
CREATE INDEX "saved_listing_views_user_idx" ON "saved_listing_views" USING btree ("user_id");
--> statement-breakpoint
-- Reuse retained catalog JSON to populate media URLs without contacting sources.
WITH captured_images AS (
  SELECT catalog_product.id AS product_id, image.data->>'src' AS url
  FROM source_evidence AS evidence
  JOIN catalog_sources AS source ON source.id = evidence.source_id AND source.module_id = 'shopify'
  CROSS JOIN LATERAL jsonb_array_elements(
    CASE
      WHEN jsonb_typeof(evidence.payload->'pages') = 'array' THEN evidence.payload->'pages'
      WHEN jsonb_typeof(evidence.payload->'products') = 'array' THEN jsonb_build_array(evidence.payload)
      ELSE '[]'::jsonb
    END
  ) AS page(data)
  CROSS JOIN LATERAL jsonb_array_elements(
    CASE WHEN jsonb_typeof(page.data->'products') = 'array' THEN page.data->'products' ELSE '[]'::jsonb END
  ) AS product(data)
  CROSS JOIN LATERAL jsonb_array_elements(
    CASE WHEN jsonb_typeof(product.data->'images') = 'array' THEN product.data->'images' ELSE '[]'::jsonb END
  ) AS image(data)
  JOIN catalog_products AS catalog_product ON catalog_product.product_key =
    'shopify:' || split_part(source.source_key, '/', 1) || ':product:' || (product.data->>'id')
  WHERE image.data->>'src' LIKE 'https://%'
), product_images AS (
  SELECT product_id, jsonb_agg(DISTINCT url) AS urls
  FROM captured_images
  GROUP BY product_id
)
UPDATE catalog_products AS product
SET image_urls = product_images.urls
FROM product_images
WHERE product.id = product_images.product_id;
