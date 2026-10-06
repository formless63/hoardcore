CREATE TABLE "source_routing" (
	"source_id" uuid PRIMARY KEY NOT NULL,
	"mode" text NOT NULL,
	"endpoint" text DEFAULT '' NOT NULL,
	"username" text DEFAULT '' NOT NULL,
	"encrypted_password" jsonb,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "source_routing" ADD CONSTRAINT "source_routing_source_id_catalog_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."catalog_sources"("id") ON DELETE cascade ON UPDATE no action;