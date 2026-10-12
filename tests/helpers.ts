import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { loadContent } from "@/content/load";
import type { ContentSet } from "@/content/schema";
import * as schema from "@/db/schema";
import { seedContent } from "@/db/seed";
import type { DB } from "@/db/types";

export const sample = () => loadContent(path.join(process.cwd(), "content/slice"));

export async function makeDb(content: ContentSet): Promise<DB> {
  const db = drizzle(new PGlite(), { schema });
  await migrate(db, { migrationsFolder: path.join(process.cwd(), "drizzle") });
  await seedContent(db as unknown as DB, content);
  return db as unknown as DB;
}

/** Sample content plus later-episode material that must stay hidden until its gate opens. */
export function withFuture(): ContentSet {
  const c = structuredClone(sample());
  c.lanes.push({ id: "yeagerists", label: "Yeagerists", sort: 4, watch_ep: 70 });
  c.nodes.push(
    {
      id: "evt_late_event", type: "event", title: "Late Event", faction_lane: "yeagerists", watch_ep: 70, story_order: 2,
      is_flashback: true, happened_in: "years earlier", confidence: "shown", depth_layer: "surface", tier: 1,
      summary: "Something only ep 70 viewers should see.", because: "A hidden cause.", setup_ref: "evt_declaration_of_war",
      void_pos: null, participants: ["char_eren", "char_late"],
    },
    {
      id: "evt_theory_event", type: "event", title: "Fan Theory Event", faction_lane: "marley_military", watch_ep: 61, story_order: null,
      is_flashback: false, happened_in: null, confidence: "interpretation", depth_layer: "surface", tier: 2,
      summary: "A debated reading.", because: null, setup_ref: null, void_pos: null, participants: [],
    },
    {
      id: "char_late", type: "character", title: "Late Character", watch_ep: 70, confidence: "shown",
      tier: 2, summary: null, bio: null, tags: [], icon: null, color: null, source_url: null,
      lane_history: [{ from_ep: 70, lane: "yeagerists" }],
    },
  );
  c.edges.push({ id: "edge_declaration_to_late", from: "evt_declaration_of_war", to: "evt_late_event", type: "causes", watch_ep: 70, confidence: "shown", why_text: "Late link." });
  c.facts.push({ id: "fact_late", text: "A late reveal.", revealed_ep: 70 });
  c.knowledge_states.push(
    { holder: "char_eren", fact: "fact_late", state: "hides", from_ep: 70, to_ep: null, confidence: "shown" },
    // Gabi's false belief ends at ep 72. At ep 64 the client must not learn that it ever ends.
    { holder: "char_gabi", fact: "fact_world_beyond_walls", state: "not_knows", from_ep: 60, to_ep: 72, confidence: "shown" },
  );
  return c;
}
