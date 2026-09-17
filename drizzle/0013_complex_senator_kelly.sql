CREATE TYPE "public"."source_listing_presence_status" AS ENUM('present', 'missing');--> statement-breakpoint
ALTER TYPE "public"."listing_decision_state" RENAME TO "listing_decision_state_old";--> statement-breakpoint
CREATE TYPE "public"."listing_decision_state" AS ENUM('unreviewed', 'researching', 'pass', 'buy_candidate', 'interesting', 'watch', 'ignore', 'buy', 'archived');--> statement-breakpoint
ALTER TABLE "listing_decisions" ALTER COLUMN "state" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "listing_decisions" ALTER COLUMN "state" TYPE "listing_decision_state" USING "state"::text::"listing_decision_state";--> statement-breakpoint
DROP TYPE "public"."listing_decision_state_old";--> statement-breakpoint
CREATE TABLE "listing_decision_transitions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"listing_id" uuid NOT NULL,
	"actor_id" text NOT NULL,
	"from_state" "listing_decision_state",
	"to_state" "listing_decision_state" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "listing_shared_decision_notes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"listing_id" uuid NOT NULL,
	"author_id" text NOT NULL,
	"body" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "opportunity_assumptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"listing_id" uuid NOT NULL,
	"currency" text,
	"inputs" jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "listing_decisions" ALTER COLUMN "state" SET DEFAULT 'interesting';--> statement-breakpoint
ALTER TABLE "collection_runs" ADD COLUMN "inter_page_wait_ms" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "collection_runs" ADD COLUMN "next_page" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "collection_runs" ADD COLUMN "evidence_pages" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "collection_runs" ADD COLUMN "observed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "collection_runs" ADD COLUMN "next_allowed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "collection_runs" ADD COLUMN "minimum_allowed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "collection_runs" ADD COLUMN "retry_after_until" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "source_listing_current" ADD COLUMN "presence" "source_listing_presence_status" DEFAULT 'present' NOT NULL;--> statement-breakpoint
ALTER TABLE "source_listing_current" ADD COLUMN "first_seen_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "source_listing_current" ADD COLUMN "last_seen_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "source_listing_current" ADD COLUMN "missing_since" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "source_listing_current" ADD COLUMN "missing_run_id" uuid;--> statement-breakpoint
ALTER TABLE "listing_decision_transitions" ADD CONSTRAINT "listing_decision_transitions_listing_id_source_listings_id_fk" FOREIGN KEY ("listing_id") REFERENCES "public"."source_listings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "listing_decision_transitions" ADD CONSTRAINT "listing_decision_transitions_actor_id_user_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "listing_shared_decision_notes" ADD CONSTRAINT "listing_shared_decision_notes_listing_id_source_listings_id_fk" FOREIGN KEY ("listing_id") REFERENCES "public"."source_listings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "listing_shared_decision_notes" ADD CONSTRAINT "listing_shared_decision_notes_author_id_user_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "opportunity_assumptions" ADD CONSTRAINT "opportunity_assumptions_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "opportunity_assumptions" ADD CONSTRAINT "opportunity_assumptions_listing_id_source_listings_id_fk" FOREIGN KEY ("listing_id") REFERENCES "public"."source_listings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "listing_decision_transitions_listing_created_idx" ON "listing_decision_transitions" USING btree ("listing_id","created_at");--> statement-breakpoint
CREATE INDEX "listing_shared_decision_notes_listing_created_idx" ON "listing_shared_decision_notes" USING btree ("listing_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "opportunity_assumptions_user_listing_idx" ON "opportunity_assumptions" USING btree ("user_id","listing_id");--> statement-breakpoint
CREATE INDEX "opportunity_assumptions_listing_idx" ON "opportunity_assumptions" USING btree ("listing_id");--> statement-breakpoint
ALTER TABLE "source_listing_current" ADD CONSTRAINT "source_listing_current_missing_run_id_collection_runs_id_fk" FOREIGN KEY ("missing_run_id") REFERENCES "public"."collection_runs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
UPDATE "source_listing_current" SET "first_seen_at" = "observed_at", "last_seen_at" = "observed_at" WHERE "first_seen_at" IS NULL OR "last_seen_at" IS NULL;--> statement-breakpoint
INSERT INTO "listing_decision_transitions" ("listing_id", "actor_id", "from_state", "to_state", "created_at") SELECT "listing_id", "user_id", NULL, "state", "updated_at" FROM "listing_decisions";
