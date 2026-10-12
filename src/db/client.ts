import "server-only";
import path from "node:path";
import { drizzle as drizzlePg } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { loadEpisodesCsv } from "@/content/episodes";
import { loadContent } from "@/content/load";
import { seedContent } from "./seed";
import { seedEpisodes } from "./seed-episodes";
import * as schema from "./schema";
import type { DB } from "./types";

const g = globalThis as unknown as { __aotDb?: Promise<DB> };

/**
 * Production / docker: DATABASE_URL -> Postgres.
 * Local dev with no DATABASE_URL: in-memory Postgres (pglite), migrated and seeded from content/slice.
 */
export function getDb(): Promise<DB> {
  g.__aotDb ??= open();
  return g.__aotDb;
}

async function open(): Promise<DB> {
  if (process.env.DATABASE_URL) return drizzlePg(postgres(process.env.DATABASE_URL), { schema }) as unknown as DB;
  if (process.env.NODE_ENV === "production") throw new Error("DATABASE_URL is required in production");

  const { PGlite } = await import("@electric-sql/pglite");
  const { drizzle } = await import("drizzle-orm/pglite");
  const { migrate } = await import("drizzle-orm/pglite/migrator");
  const db = drizzle(new PGlite(), { schema });
  await migrate(db, { migrationsFolder: path.join(process.cwd(), "drizzle") });
  await seedEpisodes(db as unknown as DB, loadEpisodesCsv().episodes);
  await seedContent(db as unknown as DB, loadContent(path.join(process.cwd(), "content/slice")));
  return db as unknown as DB;
}
