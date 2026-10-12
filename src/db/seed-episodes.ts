import type { EpisodeC } from "@/content/schema";
import * as t from "./schema";
import type { DB } from "./types";

/**
 * Replaces the episode spine in one transaction. Idempotent, like seedContent: the CSV is
 * hand-maintained, so a re-seed must be able to fix a title rather than keep the first copy
 * (which is what ON CONFLICT DO NOTHING would do).
 */
export async function seedEpisodes(db: DB, episodes: EpisodeC[]): Promise<number> {
  if (!episodes.length) return 0;
  await db.transaction(async (tx) => {
    await tx.delete(t.episodes);
    await tx.insert(t.episodes).values(
      episodes.map((e) => ({
        episodeAbs: e.episode_abs,
        season: e.season,
        part: e.part,
        episodeInPart: e.episode_in_part,
        title: e.title,
        arc: e.arc,
        episodeType: e.episode_type,
        summary: e.summary,
        sourceUrl: e.source_url,
      })),
    );
  });
  return episodes.length;
}