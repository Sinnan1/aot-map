CREATE TABLE "node_aliases" (
	"id" serial PRIMARY KEY NOT NULL,
	"node_id" text NOT NULL,
	"alias" text NOT NULL,
	"from_ep" integer NOT NULL
);
--> statement-breakpoint
ALTER TABLE "node_aliases" ADD CONSTRAINT "node_aliases_node_id_nodes_id_fk" FOREIGN KEY ("node_id") REFERENCES "public"."nodes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "node_aliases_node_alias_uidx" ON "node_aliases" USING btree ("node_id","alias");--> statement-breakpoint
CREATE INDEX "node_aliases_from_ep_idx" ON "node_aliases" USING btree ("from_ep");--> statement-breakpoint
CREATE INDEX "node_aliases_alias_idx" ON "node_aliases" USING btree ("alias");--> statement-breakpoint
ALTER TABLE "nodes" DROP COLUMN "aliases";