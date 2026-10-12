ALTER TYPE "public"."relationship_type" ADD VALUE 'MEMBER_OF';--> statement-breakpoint
ALTER TYPE "public"."relationship_type" ADD VALUE 'LEADS';--> statement-breakpoint
ALTER TYPE "public"."relationship_type" ADD VALUE 'ENEMY_OF';--> statement-breakpoint
ALTER TYPE "public"."relationship_type" ADD VALUE 'INFILTRATES';--> statement-breakpoint
ALTER TYPE "public"."relationship_type" ADD VALUE 'OPPOSES';--> statement-breakpoint
ALTER TYPE "public"."relationship_type" ADD VALUE 'OVERTHROWS';--> statement-breakpoint
ALTER TYPE "public"."relationship_type" ADD VALUE 'REBELS_AGAINST';--> statement-breakpoint
ALTER TYPE "public"."relationship_type" ADD VALUE 'NEGOTIATES_WITH';--> statement-breakpoint
ALTER TYPE "public"."relationship_type" ADD VALUE 'ALLIED_WITH';--> statement-breakpoint
ALTER TABLE "relationships" DROP CONSTRAINT "relationships_source_id_nodes_id_fk";
--> statement-breakpoint
ALTER TABLE "relationships" DROP CONSTRAINT "relationships_target_id_nodes_id_fk";
