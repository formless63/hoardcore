CREATE TABLE "source_category_group_overrides" (
	"source_id" uuid NOT NULL,
	"source_category" text NOT NULL,
	"category_group" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "source_category_group_overrides_pk" PRIMARY KEY("source_id","source_category")
);
--> statement-breakpoint
ALTER TABLE "source_category_group_overrides" ADD CONSTRAINT "source_category_group_overrides_source_id_catalog_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."catalog_sources"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "source_category_group_overrides_group_idx" ON "source_category_group_overrides" USING btree ("category_group");