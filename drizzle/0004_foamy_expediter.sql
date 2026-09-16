CREATE TABLE "app_settings" (
	"id" integer PRIMARY KEY NOT NULL,
	"default_collection_request_limit" integer DEFAULT 3 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "source_listing_current" ADD COLUMN "compare_at_price" numeric(14, 2);--> statement-breakpoint
ALTER TABLE "source_listing_observations" ADD COLUMN "compare_at_price" numeric(14, 2);--> statement-breakpoint
-- Backfill the module's comparison price from retained source evidence. No
-- source requests are made, and non-Shopify evidence is untouched.
WITH variant_prices AS (
  SELECT evidence.id AS evidence_id,
         listing.id AS listing_id,
         (variant.data->>'compare_at_price')::numeric(14, 2) AS compare_at_price
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
    CASE WHEN jsonb_typeof(product.data->'variants') = 'array' THEN product.data->'variants' ELSE '[]'::jsonb END
  ) AS variant(data)
  JOIN catalog_variants AS catalog_variant ON catalog_variant.variant_key =
    'shopify:' || split_part(source.source_key, '/', 1) || ':product:' || (product.data->>'id') || ':variant:' || (variant.data->>'id')
  JOIN source_listings AS listing ON listing.source_id = source.id AND listing.variant_id = catalog_variant.id
  WHERE variant.data->>'compare_at_price' ~ '^[0-9]+(\.[0-9]+)?$'
)
UPDATE source_listing_observations AS observation
SET compare_at_price = variant_prices.compare_at_price
FROM variant_prices
WHERE observation.evidence_id = variant_prices.evidence_id
  AND observation.listing_id = variant_prices.listing_id;--> statement-breakpoint
WITH latest_observation AS (
  SELECT DISTINCT ON (listing_id) listing_id, compare_at_price
  FROM source_listing_observations
  ORDER BY listing_id, observed_at DESC, id DESC
)
UPDATE source_listing_current AS current_state
SET compare_at_price = latest_observation.compare_at_price
FROM latest_observation
WHERE current_state.listing_id = latest_observation.listing_id;
