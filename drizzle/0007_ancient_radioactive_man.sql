CREATE TYPE "public"."relationship_type" AS ENUM('INHERITS_TITAN', 'RESTRICTED_BY', 'REQUIRES', 'ENABLES', 'CONTROLS', 'USED_BY', 'USES', 'CONNECTED_THROUGH_PATHS');--> statement-breakpoint
CREATE TABLE "relationships" (
	"id" text PRIMARY KEY NOT NULL,
	"source_id" text NOT NULL,
	"target_id" text NOT NULL,
	"relationship_type" "relationship_type" NOT NULL,
	"label" text NOT NULL,
	"true_from_ep" integer NOT NULL,
	"visible_from_ep" integer NOT NULL,
	"expires_ep" integer,
	"confidence" "confidence" NOT NULL,
	"description" text NOT NULL,
	"source_url" text
);
--> statement-breakpoint
ALTER TABLE "relationships" ADD CONSTRAINT "relationships_source_id_nodes_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."nodes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "relationships" ADD CONSTRAINT "relationships_target_id_nodes_id_fk" FOREIGN KEY ("target_id") REFERENCES "public"."nodes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "relationships_visible_from_ep_idx" ON "relationships" USING btree ("visible_from_ep");