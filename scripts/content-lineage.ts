/**
 * Lineage depth: how many hops it takes a viewer to walk from a causally deep event back to a root.
 *
 * This measures the product promise directly -- "a Season 4 viewer can trace a confusing event back
 * to a minor Season 1 detail" -- which no existing lint rule can check. GATE_ORDER and
 * BECAUSE_UNBACKED guarantee the graph is structurally sound; this asks whether it is also READABLE.
 *
 * Informational, not a gate. Depth is a design signal, not an error: a long trace is a hint that the
 * author may want a stepping stone, not a rule to satisfy mechanically.
 *
 * Runs against a content directory so the researcher can measure their own submission:
 *   npm run content:lineage
 *   npx tsx scripts/content-lineage.ts content/their-drop
 */
import { loadContent } from "../src/content/load";
import type { ContentSet } from "../src/content/schema";

/**
 * Hops above which a trace stops reading as an explanation and starts reading as a survey.
 * 4 is a judgement call: one or two hops is a clean answer, three or four is a puzzle worth solving,
 * five or more means the viewer is being asked to hold too much in their head at once.
 */
const DEEP = 4;

const SEASON4_FIRST_EP = 60;
const FOUNDATION_LAST_EP = 59;

const dir = process.argv[2] ?? "content/slice";
const c: ContentSet = loadContent(dir);

const events = c.nodes.filter((n) => n.type === "event");
const byId = new Map(events.map((n) => [n.id, n]));

// `causes` runs forward in time, so the "backward" direction of a cause is to -> from.
const causesInto = new Map<string, string[]>();
for (const e of c.edges) {
  if (e.type !== "causes") continue;
  causesInto.set(e.to, [...(causesInto.get(e.to) ?? []), e.from]);
}

/** Shortest path from any root (no incoming causes) to `id`, or null if the node is in a cycle. */
const depthCache = new Map<string, number | null>();
const depthOf = (id: string, seen: Set<string> = new Set()): number | null => {
  if (depthCache.has(id)) return depthCache.get(id)!;
  if (seen.has(id)) return null; // cycle: no root is reachable from here
  const parents = causesInto.get(id) ?? [];
  if (parents.length === 0) {
    depthCache.set(id, 0);
    return 0;
  }
  const next = new Set(seen).add(id);
  let best: number | null = null;
  for (const p of parents) {
    const d = depthOf(p, next);
    if (d !== null && (best === null || d + 1 < best)) best = d + 1;
  }
  depthCache.set(id, best);
  return best;
};

/** One representative chain from a root forward to `id`, for the walkthrough. */
const examplePath = (id: string): string[] => {
  const path: string[] = [id];
  let cur = id;
  const seen = new Set<string>();
  while (!seen.has(cur)) {
    seen.add(cur);
    const parent = (causesInto.get(cur) ?? []).filter((p) => byId.has(p)).sort((a, b) => byId.get(b)!.watch_ep - byId.get(a)!.watch_ep)[0];
    if (!parent) break;
    path.push(parent);
    cur = parent;
  }
  return path.reverse();
};

const depths = events.map((n) => ({ node: n, depth: depthOf(n.id) }));
const rooted = depths.filter((d) => d.depth !== null);
const orphaned = depths.filter((d) => d.depth === null); // in a cycle
const roots = rooted.filter((d) => d.depth === 0);
const deep = rooted.filter((d) => (d.depth ?? 0) > DEEP);


const maxDepth = Math.max(0, ...rooted.map((d) => d.depth ?? 0));
const avgDepth = rooted.length ? (rooted.reduce((s, d) => s + (d.depth ?? 0), 0) / rooted.length).toFixed(1) : "0";

console.log(`\nLineage depth -- ${dir}`);
console.log(`${events.length} events, ${c.edges.filter((e) => e.type === "causes").length} causes edges\n`);

console.log(`roots (no incoming cause)   ${roots.length}`);
console.log(`reachable from a root      ${rooted.length - roots.length}`);
console.log(`in a cycle (no root)       ${orphaned.length}`);
console.log(`max depth                  ${maxDepth}`);
console.log(`mean depth                 ${avgDepth}`);

const buckets = new Map<number, number>();
for (const d of rooted) buckets.set(d.depth ?? 0, (buckets.get(d.depth ?? 0) ?? 0) + 1);
console.log("\ndepth histogram");
for (const [depth, count] of [...buckets].sort((a, b) => a[0] - b[0])) {
  console.log(`  ${String(depth).padStart(2)} ${"#".repeat(Math.min(count, 40))} ${count}`);
}

const s4 = rooted.filter((d) => d.node.watch_ep >= SEASON4_FIRST_EP);
const reachesFoundation = s4.filter((d) => (d.depth ?? 0) > 0);
console.log(`\nSeason 4+ events           ${s4.length}`);
console.log(`  with a traced lineage    ${reachesFoundation.length}`);

if (deep.length) {
  console.log(`\nDeeper than ${DEEP} hops -- consider a stepping stone:`);
  for (const d of deep.sort((a, b) => (b.depth ?? 0) - (a.depth ?? 0))) {
    console.log(`  ${String(d.depth).padStart(2)}  ${d.node.id} (ep ${d.node.watch_ep}) "${d.node.title}"`);
  }
  const sample = deep[0]!;
  console.log(`\n  example walkback for ${sample.node.id}:`);
  for (const id of examplePath(sample.node.id)) {
    const n = byId.get(id)!;
    console.log(`    ep ${String(n.watch_ep).padStart(2)}  ${n.title}`);
  }
}

if (orphaned.length) {
  console.log(`\nCyclic -- no root is reachable, so Why Mode cannot trace these:`);
  for (const d of orphaned) console.log(`     ${d.node.id} (ep ${d.node.watch_ep}) "${d.node.title}"`);
}

const silent = events.filter((n) => n.because !== null && (causesInto.get(n.id) ?? []).length === 0);
if (silent.length) {
  console.log(`\nStates a cause in copy with no causes edge (BECAUSE_UNBACKED will catch these):`);
  for (const n of silent) console.log(`     ${n.id} (ep ${n.watch_ep})`);
}

console.log(`\nDepth is informational. A long trace is a hint to add a stepping stone, not a failure.\n`);