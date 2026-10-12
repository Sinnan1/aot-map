CREATE TYPE "public"."episode_type" AS ENUM('normal', 'premiere', 'finale', 'reveal', 'special', 'recap');--> statement-breakpoint
CREATE TABLE "episodes" (
	"episode_abs" integer PRIMARY KEY NOT NULL,
	"season" integer NOT NULL,
	"part" integer,
	"episode_in_part" integer NOT NULL,
	"title" text NOT NULL,
	"arc" text NOT NULL,
	"episode_type" "episode_type" DEFAULT 'normal' NOT NULL,
	"summary" text,
	"source_url" text
);
--> statement-breakpoint
CREATE INDEX "episodes_season_idx" ON "episodes" USING btree ("season");--> statement-breakpoint
CREATE INDEX "episodes_arc_idx" ON "episodes" USING btree ("arc");--> statement-breakpoint
CREATE UNIQUE INDEX "episodes_season_part_order_idx" ON "episodes" USING btree ("season","part","episode_in_part");