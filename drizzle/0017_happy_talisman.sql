CREATE TABLE "source_origin_safety" (
	"origin" text PRIMARY KEY NOT NULL,
	"blocked_until" timestamp with time zone,
	"paused" boolean DEFAULT false NOT NULL,
	"throttle_strikes" integer DEFAULT 0 NOT NULL,
	"last_event" text,
	"last_event_at" timestamp with time zone,
	"next_request_at" timestamp with time zone,
	"last_scan_at" timestamp with time zone,
	"reason" text
);
--> statement-breakpoint
CREATE TABLE "source_response_policies" (
	"source_id" uuid PRIMARY KEY NOT NULL,
	"policy" jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "source_response_subscriptions" (
	"source_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"event_types" jsonb DEFAULT '[]'::jsonb NOT NULL,
	CONSTRAINT "source_response_subscriptions_source_id_user_id_pk" PRIMARY KEY("source_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "source_safety_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source_id" uuid NOT NULL,
	"origin" text NOT NULL,
	"event_type" text NOT NULL,
	"message" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "notification_deliveries" ALTER COLUMN "listing_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "source_response_policies" ADD CONSTRAINT "source_response_policies_source_id_catalog_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."catalog_sources"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "source_response_subscriptions" ADD CONSTRAINT "source_response_subscriptions_source_id_catalog_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."catalog_sources"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "source_response_subscriptions" ADD CONSTRAINT "source_response_subscriptions_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "source_safety_events" ADD CONSTRAINT "source_safety_events_source_id_catalog_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."catalog_sources"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "source_safety_events_source_idx" ON "source_safety_events" USING btree ("source_id","created_at");