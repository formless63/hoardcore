CREATE TYPE "public"."listing_decision_state" AS ENUM('unreviewed', 'researching', 'pass', 'buy_candidate');--> statement-breakpoint
CREATE TABLE "listing_decisions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"listing_id" uuid NOT NULL,
	"state" "listing_decision_state" DEFAULT 'unreviewed' NOT NULL,
	"note" text DEFAULT '' NOT NULL,
	"expected_quantity" integer,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "listing_decisions" ADD CONSTRAINT "listing_decisions_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "listing_decisions" ADD CONSTRAINT "listing_decisions_listing_id_source_listings_id_fk" FOREIGN KEY ("listing_id") REFERENCES "public"."source_listings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "listing_decisions_user_listing_idx" ON "listing_decisions" USING btree ("user_id","listing_id");--> statement-breakpoint
CREATE INDEX "listing_decisions_listing_idx" ON "listing_decisions" USING btree ("listing_id");