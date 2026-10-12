CREATE TYPE "public"."confidence" AS ENUM('shown', 'implied', 'interpretation');--> statement-breakpoint
CREATE TYPE "public"."depth_layer" AS ENUM('surface', 'paths');--> statement-breakpoint
CREATE TYPE "public"."edge_type" AS ENUM('causes', 'alliance', 'secret');--> statement-breakpoint
CREATE TYPE "public"."knowledge_state" AS ENUM('knows', 'not_knows', 'believes_falsely', 'hides');--> statement-breakpoint
CREATE TYPE "public"."node_type" AS ENUM('event', 'character');--> statement-breakpoint
CREATE TABLE "character_goals" (
	"id" serial PRIMARY KEY NOT NULL,
	"character_id" text NOT NULL,
	"text" text NOT NULL,
	"from_ep" integer NOT NULL,
	"to_ep" integer,
	"confidence" "confidence" NOT NULL
);
--> statement-breakpoint
CREATE TABLE "edges" (
	"id" text PRIMARY KEY NOT NULL,
	"from_id" text NOT NULL,
	"to_id" text NOT NULL,
	"type" "edge_type" NOT NULL,
	"watch_ep" integer NOT NULL,
	"confidence" "confidence" NOT NULL,
	"why_text" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "facts" (
	"id" text PRIMARY KEY NOT NULL,
	"text" text NOT NULL,
	"revealed_ep" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "knowledge_states" (
	"id" serial PRIMARY KEY NOT NULL,
	"holder" text NOT NULL,
	"fact_id" text NOT NULL,
	"state" "knowledge_state" NOT NULL,
	"from_ep" integer NOT NULL,
	"to_ep" integer,
	"confidence" "confidence" NOT NULL
);
--> statement-breakpoint
CREATE TABLE "lane_history" (
	"character_id" text NOT NULL,
	"from_ep" integer NOT NULL,
	"lane_id" text NOT NULL,
	CONSTRAINT "lane_history_character_id_from_ep_pk" PRIMARY KEY("character_id","from_ep")
);
--> statement-breakpoint
CREATE TABLE "lanes" (
	"id" text PRIMARY KEY NOT NULL,
	"label" text NOT NULL,
	"sort" integer NOT NULL,
	"watch_ep" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "node_participants" (
	"node_id" text NOT NULL,
	"character_id" text NOT NULL,
	CONSTRAINT "node_participants_node_id_character_id_pk" PRIMARY KEY("node_id","character_id")
);
--> statement-breakpoint
CREATE TABLE "nodes" (
	"id" text PRIMARY KEY NOT NULL,
	"type" "node_type" NOT NULL,
	"title" text NOT NULL,
	"faction_lane" text,
	"watch_ep" integer NOT NULL,
	"story_order" integer,
	"is_flashback" boolean DEFAULT false NOT NULL,
	"happened_in" text,
	"confidence" "confidence" NOT NULL,
	"depth_layer" "depth_layer" DEFAULT 'surface' NOT NULL,
	"tier" smallint DEFAULT 2 NOT NULL,
	"summary" text,
	"because" text,
	"setup_ref" text,
	"void_pos" jsonb,
	"aliases" text[] DEFAULT '{}' NOT NULL
);
--> statement-breakpoint
ALTER TABLE "character_goals" ADD CONSTRAINT "character_goals_character_id_nodes_id_fk" FOREIGN KEY ("character_id") REFERENCES "public"."nodes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "edges" ADD CONSTRAINT "edges_from_id_nodes_id_fk" FOREIGN KEY ("from_id") REFERENCES "public"."nodes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "edges" ADD CONSTRAINT "edges_to_id_nodes_id_fk" FOREIGN KEY ("to_id") REFERENCES "public"."nodes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_states" ADD CONSTRAINT "knowledge_states_fact_id_facts_id_fk" FOREIGN KEY ("fact_id") REFERENCES "public"."facts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lane_history" ADD CONSTRAINT "lane_history_character_id_nodes_id_fk" FOREIGN KEY ("character_id") REFERENCES "public"."nodes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lane_history" ADD CONSTRAINT "lane_history_lane_id_lanes_id_fk" FOREIGN KEY ("lane_id") REFERENCES "public"."lanes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "node_participants" ADD CONSTRAINT "node_participants_node_id_nodes_id_fk" FOREIGN KEY ("node_id") REFERENCES "public"."nodes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "node_participants" ADD CONSTRAINT "node_participants_character_id_nodes_id_fk" FOREIGN KEY ("character_id") REFERENCES "public"."nodes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "nodes" ADD CONSTRAINT "nodes_faction_lane_lanes_id_fk" FOREIGN KEY ("faction_lane") REFERENCES "public"."lanes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "nodes" ADD CONSTRAINT "nodes_setup_ref_nodes_id_fk" FOREIGN KEY ("setup_ref") REFERENCES "public"."nodes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "edges_watch_ep_idx" ON "edges" USING btree ("watch_ep");--> statement-breakpoint
CREATE INDEX "knowledge_from_ep_idx" ON "knowledge_states" USING btree ("from_ep");--> statement-breakpoint
CREATE INDEX "nodes_watch_ep_idx" ON "nodes" USING btree ("watch_ep");