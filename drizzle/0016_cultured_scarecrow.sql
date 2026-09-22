CREATE TYPE "public"."loxep_connection_status" AS ENUM('active', 'disabled', 'revoked');--> statement-breakpoint
CREATE TYPE "public"."loxep_delivery_status" AS ENUM('pending', 'accepted', 'failed');--> statement-breakpoint
CREATE TABLE "loxep_connections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"name" text NOT NULL,
	"base_url" text NOT NULL,
	"remote_connection_id" text NOT NULL,
	"token_ciphertext" text NOT NULL,
	"token_nonce" text NOT NULL,
	"token_auth_tag" text NOT NULL,
	"callback_token_hash" text NOT NULL,
	"callback_token_prefix" text NOT NULL,
	"status" "loxep_connection_status" DEFAULT 'active' NOT NULL,
	"last_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "loxep_connections_callback_token_hash_unique" UNIQUE("callback_token_hash")
);
--> statement-breakpoint
CREATE TABLE "loxep_deliveries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"connection_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"listing_id" uuid NOT NULL,
	"event_id" text NOT NULL,
	"payload" jsonb NOT NULL,
	"status" "loxep_delivery_status" DEFAULT 'pending' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"last_attempt_at" timestamp with time zone,
	"last_response_status" integer,
	"remote_marketplace_item_id" text,
	"last_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "loxep_deliveries_event_id_unique" UNIQUE("event_id")
);
--> statement-breakpoint
CREATE TABLE "loxep_outcome_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"connection_id" uuid NOT NULL,
	"event_id" text NOT NULL,
	"event_type" text NOT NULL,
	"listing_id" uuid,
	"payload" jsonb NOT NULL,
	"payload_hash" text NOT NULL,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "loxep_connections" ADD CONSTRAINT "loxep_connections_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "loxep_deliveries" ADD CONSTRAINT "loxep_deliveries_connection_id_loxep_connections_id_fk" FOREIGN KEY ("connection_id") REFERENCES "public"."loxep_connections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "loxep_deliveries" ADD CONSTRAINT "loxep_deliveries_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "loxep_deliveries" ADD CONSTRAINT "loxep_deliveries_listing_id_source_listings_id_fk" FOREIGN KEY ("listing_id") REFERENCES "public"."source_listings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "loxep_outcome_events" ADD CONSTRAINT "loxep_outcome_events_connection_id_loxep_connections_id_fk" FOREIGN KEY ("connection_id") REFERENCES "public"."loxep_connections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "loxep_outcome_events" ADD CONSTRAINT "loxep_outcome_events_listing_id_source_listings_id_fk" FOREIGN KEY ("listing_id") REFERENCES "public"."source_listings"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "loxep_connections_user_created_idx" ON "loxep_connections" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "loxep_connections_user_remote_idx" ON "loxep_connections" USING btree ("user_id","remote_connection_id");--> statement-breakpoint
CREATE UNIQUE INDEX "loxep_deliveries_connection_listing_idx" ON "loxep_deliveries" USING btree ("connection_id","listing_id");--> statement-breakpoint
CREATE INDEX "loxep_deliveries_user_updated_idx" ON "loxep_deliveries" USING btree ("user_id","updated_at");--> statement-breakpoint
CREATE UNIQUE INDEX "loxep_outcome_events_connection_event_idx" ON "loxep_outcome_events" USING btree ("connection_id","event_id");--> statement-breakpoint
CREATE INDEX "loxep_outcome_events_connection_received_idx" ON "loxep_outcome_events" USING btree ("connection_id","received_at");