import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { loadEpisodesCsv, lintEpisodes, lintGateCoverage } from "../src/content/episodes";
import type { ContentSet } from "../src/content/schema";
import { loadContent } from "../src/content/load";
import * as schema from "../src/db/schema";
import { seedEpisodes } from "../src/db/seed-episodes";

/** Wrapped in main() because tsx emits CJS here, where top-level await is a transform error. */
async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const check = args.includes("--check");
  const file = args.find((a) => !a.startsWith("--")) ?? "content/episodes.csv";
  const contentDir = args.filter((a) => !a.startsWith("--"))[1] ?? "content/slice";

  const { episodes, skippedHeaders } = loadEpisodesCsv(file);
  const issues = lintEpisodes(episodes);
  if (skippedHeaders)
    issues.push({ severity: "warn", code: "REPEATED_HEADER", id: file, message: `skipped ${skippedHeaders} repeated header row(s) from concatenated blocks` });

  // The spine must cover every gate coordinate the content uses, or a node sits at an episode
  // the UI cannot describe.
  const gateValues = (c: ContentSet): number[] => [
    ...c.lanes.map((l) => l.watch_ep),
    ...c.nodes.map((n) => n.watch_ep),
    ...c.edges.map((e) => e.watch_ep),
    ...c.facts.map((f) => f.revealed_ep),
    ...c.knowledge_states.flatMap((k) => [k.from_ep, ...(k.to_ep === null ? [] : [k.to_ep])]),
    ...c.goals.flatMap((g) => [g.from_ep, ...(g.to_ep === null ? [] : [g.to_ep])]),
    ...c.terms.map((t) => t.watch_ep),
  ];
  issues.push(...lintGateCoverage(episodes, gateValues(loadContent(contentDir))));

  issues.forEach((i) => console.log(`${i.severity} ${i.code} ${i.id}: ${i.message}`));
  if (issues.some((i) => i.severity === "error")) {
    console.error("Refusing to seed: lint errors.");
    process.exit(1);
  }
  if (check) {
    console.log(`ok: ${episodes.length} episodes (1-${episodes.at(-1)?.episode_abs}), spine covers the gate coordinates in ${contentDir}`);
    return;
  }

  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("Set DATABASE_URL (see .env.example)");

  const client = postgres(url, { max: 1 });
  const n = await seedEpisodes(drizzle(client, { schema }), episodes);
  await client.end();
  console.log(`seeded ${n} episodes (1-${episodes.at(-1)?.episode_abs}) from ${file}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});