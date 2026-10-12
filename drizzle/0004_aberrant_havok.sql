CREATE TYPE "public"."importance" AS ENUM('core', 'major', 'minor');--> statement-breakpoint
ALTER TABLE "nodes" ADD COLUMN "importance" "importance";