CREATE TYPE "public"."listing_decision_state" AS ENUM('unreviewed', 'researching', 'pass', 'buy_candidate');
CREATE TABLE "listing_decisions" ("id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL, "user_id" text NOT NULL REFERENCES "user"("id") ON DELETE cascade, "listing_id" uuid NOT NULL REFERENCES "source_listings"("id") ON DELETE cascade, "state" "listing_decision_state" DEFAULT 'unreviewed' NOT NULL, "note" text DEFAULT '' NOT NULL, "expected_quantity" integer, "updated_at" timestamp with time zone DEFAULT now() NOT NULL);
CREATE UNIQUE INDEX "listing_decisions_user_listing_idx" ON "listing_decisions" USING btree ("user_id","listing_id");
CREATE INDEX "listing_decisions_listing_idx" ON "listing_decisions" USING btree ("listing_id");
