ALTER TABLE "nodes" ADD COLUMN "bio" text;--> statement-breakpoint
ALTER TABLE "nodes" ADD COLUMN "tags" text[] DEFAULT '{}' NOT NULL;--> statement-breakpoint
ALTER TABLE "nodes" ADD COLUMN "icon" text;--> statement-breakpoint
ALTER TABLE "nodes" ADD COLUMN "color" text;--> statement-breakpoint
ALTER TABLE "nodes" ADD COLUMN "source_url" text;