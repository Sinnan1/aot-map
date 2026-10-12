CREATE TYPE "public"."event_type" AS ENUM('invasion', 'battle', 'decision', 'reveal', 'coup', 'political', 'ritual', 'memory');--> statement-breakpoint
CREATE TYPE "public"."participant_role" AS ENUM('primary', 'secondary', 'opponent', 'victim', 'hidden_actor', 'observer', 'memory_of', 'beneficiary', 'cause');--> statement-breakpoint
CREATE TABLE "event_participants" (
	"id" text PRIMARY KEY NOT NULL,
	"event_id" text NOT NULL,
	"entity_id" text NOT NULL,
	"role" "participant_role" NOT NULL,
	"visible_from_ep" integer NOT NULL,
	"notes" text NOT NULL,
	"source_url" text
);
--> statement-breakpoint
ALTER TABLE "nodes" ADD COLUMN "short_label" text;--> statement-breakpoint
ALTER TABLE "nodes" ADD COLUMN "event_type" "event_type";--> statement-breakpoint
ALTER TABLE "nodes" ADD COLUMN "season" integer;--> statement-breakpoint
ALTER TABLE "nodes" ADD COLUMN "episode_abs_start" integer;--> statement-breakpoint
ALTER TABLE "nodes" ADD COLUMN "episode_abs_end" integer;--> statement-breakpoint
ALTER TABLE "nodes" ADD COLUMN "arc" text;--> statement-breakpoint
ALTER TABLE "nodes" ADD COLUMN "why_it_matters" text;--> statement-breakpoint
ALTER TABLE "nodes" ADD COLUMN "location_id" text;--> statement-breakpoint
ALTER TABLE "event_participants" ADD CONSTRAINT "event_participants_event_id_nodes_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."nodes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "event_participants_event_id_idx" ON "event_participants" USING btree ("event_id");--> statement-breakpoint
CREATE INDEX "event_participants_visible_from_ep_idx" ON "event_participants" USING btree ("visible_from_ep");