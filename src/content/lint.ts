import type { ContentSet } from "./schema";

export type Severity = "error" | "warn";
export interface LintIssue {
  severity: Severity;
  code: string;
  id: string;
  message: string;
}

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const MULTI_SENTENCE = /[.!?]["')\]]?\s+[A-Z]/;

/**
 * Content lint (spec section 7, authoring rules). Pure: no I/O, runs in CI and in tests.
 * Schema validation (required fields, enums, ids) happens earlier in loadContent().
 */
export function lintContent(c: ContentSet): LintIssue[] {
  const issues: LintIssue[] = [];
  const error = (code: string, id: string, message: string) => issues.push({ severity: "error", code, id, message });
  const warn = (code: string, id: string, message: string) => issues.push({ severity: "warn", code, id, message });

  const lanes = new Map(c.lanes.map((l) => [l.id, l]));
  const nodes = new Map(c.nodes.map((n) => [n.id, n]));
  const facts = new Map(c.facts.map((f) => [f.id, f]));

  // 1. Unique ids
  const seen = new Set<string>();
  for (const id of [...c.lanes, ...c.nodes, ...c.edges, ...c.facts, ...(c.relationships ?? []), ...(c.event_participants ?? [])].map((x) => x.id)) {
    if (seen.has(id)) error("DUPLICATE_ID", id, "id is used more than once");
    seen.add(id);
  }

  // 2. Nodes
  const tier1PerEp = new Map<number, number>();
  for (const n of c.nodes) {
    if (n.type === "event") {
      const lane = lanes.get(n.faction_lane);
      if (!lane) error("REF_MISSING", n.id, `faction_lane "${n.faction_lane}" does not exist`);
      else if (n.watch_ep < lane.watch_ep)
        error("LANE_NOT_UNLOCKED", n.id, `sits in lane "${lane.id}" which unlocks at ep ${lane.watch_ep}, after this node (ep ${n.watch_ep})`);

      if (n.episode_abs_start != null && n.episode_abs_end != null && n.episode_abs_end < n.episode_abs_start)
        error("RANGE", n.id, "episode_abs_end must not be before episode_abs_start");

      if (n.location_id) {
        const loc = nodes.get(n.location_id);
        if (!loc || loc.type !== "location") error("REF_MISSING", n.id, `location_id "${n.location_id}" is not a location`);
      }

      if (n.setup_ref) {
        const s = nodes.get(n.setup_ref);
        if (!s || s.type !== "event") error("REF_MISSING", n.id, `setup_ref "${n.setup_ref}" is not an event`);
        else if (s.watch_ep > n.watch_ep)
          error("GATE_ORDER", n.id, `setup_ref ${s.id} is revealed at ep ${s.watch_ep}, after this node (ep ${n.watch_ep})`);
      }

      for (const pid of n.participants) {
        const p = nodes.get(pid);
        if (!p || p.type !== "character") error("REF_MISSING", n.id, `participant "${pid}" is not a character`);
        else if (p.watch_ep > n.watch_ep)
          error("GATE_ORDER", n.id, `participant ${pid} is introduced at ep ${p.watch_ep}, after this node (ep ${n.watch_ep})`);
      }

      if (n.because !== null) {
        const backed = c.edges.some((e) => e.to === n.id && e.type === "causes" && e.watch_ep <= n.watch_ep);
        if (!backed) error("BECAUSE_UNBACKED", n.id, "'because' needs at least one causal edge into this node, visible by its watch_ep");
        if (MULTI_SENTENCE.test(n.because)) warn("ONE_SENTENCE", n.id, "'because' should be one sentence");
      }
      if (MULTI_SENTENCE.test(n.summary)) warn("ONE_SENTENCE", n.id, "'summary' should be one sentence");

      if (n.tier === 1 && n.depth_layer === "surface") tier1PerEp.set(n.watch_ep, (tier1PerEp.get(n.watch_ep) ?? 0) + 1);
    } else if (n.type === "character") {
      let prev = 0;
      n.lane_history.forEach((h, i) => {
        const lane = lanes.get(h.lane);
        if (!lane) error("REF_MISSING", n.id, `lane_history lane "${h.lane}" does not exist`);
        else if (h.from_ep < lane.watch_ep)
          error("LANE_NOT_UNLOCKED", n.id, `lane_history puts the character in "${lane.id}" at ep ${h.from_ep}, before it unlocks (ep ${lane.watch_ep})`);
        if (h.from_ep <= prev) error("HISTORY_ORDER", n.id, "lane_history must be strictly ascending by from_ep");
        if (i === 0 && h.from_ep !== n.watch_ep) error("HISTORY_START", n.id, `first lane_history entry must start at the character's watch_ep (${n.watch_ep})`);
        prev = h.from_ep;
      });
    } else {
      if (n.summary && MULTI_SENTENCE.test(n.summary)) warn("ONE_SENTENCE", n.id, "'summary' should be one sentence");
    }
  }
  for (const [ep, count] of tier1PerEp) {
    if (count > 4) warn("TIER1_DENSITY", `ep_${ep}`, `${count} tier-1 events in one episode; the Rule of 7 will cluster the overflow`);
  }

  // 2b. Aliases: reference an existing node, never precede the node's own gate, never duplicate.
  const aliasKey = (a: (typeof c.aliases)[number]) => `${a.node_id}|${a.alias.toLowerCase()}`;
  const aliasSeen = new Map<string, number>();
  for (const a of c.aliases) {
    const key = aliasKey(a);
    const node = nodes.get(a.node_id);
    if (!node) error("REF_MISSING", key, `alias node_id "${a.node_id}" does not exist`);
    else if (a.from_ep < node.watch_ep)
      error("ALIAS_BEFORE_NODE", key, `alias is safe at ep ${a.from_ep}, before the node it names (ep ${node.watch_ep})`);
    const prev = aliasSeen.get(key);
    if (prev !== undefined) error("DUPLICATE_ALIAS", key, `duplicates the alias declared at ep ${prev}`);
    else aliasSeen.set(key, a.from_ep);
  }

  // 3. Edges
  for (const e of c.edges) {
    const from = nodes.get(e.from);
    const to = nodes.get(e.to);
    if (!from || !to) {
      error("REF_MISSING", e.id, `edge endpoint missing (${!from ? e.from : e.to})`);
      continue;
    }
    if (e.from === e.to) error("SELF_EDGE", e.id, "edge points at itself");
    if (e.watch_ep < Math.max(from.watch_ep, to.watch_ep))
      error("GATE_ORDER", e.id, `edge is revealed at ep ${e.watch_ep} but an endpoint is revealed at ep ${Math.max(from.watch_ep, to.watch_ep)}`);
    if (MULTI_SENTENCE.test(e.why_text)) warn("ONE_SENTENCE", e.id, "'why_text' should be one sentence");
  }

  // 3b. Relationships
  const entityGate = (id: string): { watch_ep: number } | undefined => nodes.get(id) ?? lanes.get(id);
  for (const r of c.relationships ?? []) {
    const src = entityGate(r.source_id);
    const dst = entityGate(r.target_id);
    if (!src || !dst) {
      error("REF_MISSING", r.id, `relationship endpoint missing (${!src ? r.source_id : r.target_id})`);
      continue;
    }
    if (r.source_id === r.target_id) error("SELF_EDGE", r.id, "relationship points at itself");
    if (r.expires_ep !== null && r.expires_ep < r.true_from_ep)
      error("RANGE", r.id, "relationship expires_ep must not be before true_from_ep");
    if (MULTI_SENTENCE.test(r.description)) warn("ONE_SENTENCE", r.id, "'description' should be one sentence");
  }

  // 3c. Event participants
  for (const ep of c.event_participants ?? []) {
    const evt = nodes.get(ep.event_id);
    if (!evt || evt.type !== "event") {
      error("REF_MISSING", ep.id, `event_participant event_id "${ep.event_id}" is not an event`);
      continue;
    }
    if (MULTI_SENTENCE.test(ep.notes)) warn("ONE_SENTENCE", ep.id, "'notes' should be one sentence");
  }

  // 4. Knowledge states and goals
  const ranges = new Map<string, Array<[number, number]>>();
  for (const k of c.knowledge_states) {
    const key = `${k.holder}|${k.fact}`;
    const fact = facts.get(k.fact);
    if (!fact) error("REF_MISSING", key, `fact "${k.fact}" does not exist`);
    else if (k.from_ep < fact.revealed_ep) error("GATE_ORDER", key, `state starts at ep ${k.from_ep}, before the fact is revealed (ep ${fact.revealed_ep})`);

    const holderNode = nodes.get(k.holder);
    const holderLane = lanes.get(k.holder);
    if (holderNode?.type === "character") {
      if (k.from_ep < holderNode.watch_ep) error("GATE_ORDER", key, `holder is introduced at ep ${holderNode.watch_ep}`);
    } else if (holderLane) {
      if (k.from_ep < holderLane.watch_ep) error("GATE_ORDER", key, `holder lane unlocks at ep ${holderLane.watch_ep}`);
    } else error("REF_MISSING", key, `holder "${k.holder}" is not a character or lane`);

    if (k.to_ep !== null && k.to_ep <= k.from_ep) error("RANGE", key, "to_ep must be greater than from_ep");
    const list = ranges.get(key) ?? [];
    const end = k.to_ep ?? Infinity;
    if (list.some(([a, b]) => k.from_ep < b && a < end)) error("STATE_OVERLAP", key, "overlapping knowledge states for the same holder and fact");
    list.push([k.from_ep, end]);
    ranges.set(key, list);
  }
  const goalRanges = new Map<string, Array<[number, number]>>();
  for (const g of c.goals) {
    const key = g.id ?? g.character;
    const ch = nodes.get(g.character);
    if (!ch || ch.type !== "character") error("REF_MISSING", key, "goal character does not exist");
    else if (!g.phase_name && g.from_ep < ch.watch_ep)
      error("GATE_ORDER", key, `goal starts at ep ${g.from_ep}, before the character appears (ep ${ch.watch_ep})`);
    if (g.to_ep !== null && g.to_ep <= g.from_ep) error("RANGE", key, "goal to_ep must be greater than from_ep");
    if (g.phase_name) {
      const list = goalRanges.get(g.character) ?? [];
      const end = g.to_ep ?? Infinity;
      if (list.some(([a, b]) => g.from_ep < b && a < end))
        error("STATE_OVERLAP", key, `overlapping phase ranges for ${g.character}`);
      list.push([g.from_ep, end]);
      goalRanges.set(g.character, list);
    }
    if (MULTI_SENTENCE.test(g.text)) warn("ONE_SENTENCE", key, "goal 'text' should be one sentence");
    if (g.fear && MULTI_SENTENCE.test(g.fear)) warn("ONE_SENTENCE", key, "goal 'fear' should be one sentence");
    if (g.belief && MULTI_SENTENCE.test(g.belief)) warn("ONE_SENTENCE", key, "goal 'belief' should be one sentence");
  }

  // 5. Spoiler lint: copy may not mention anything with a later watch_ep.
  //
  // Two vocabularies with DIFFERENT semantics, which is the subtlety that makes title checking work:
  //   termMax — the latest gate at which any entity uses this term. A title may only contain terms
  //             that are already safe at the title's own episode. Using max means a node cannot
  //             launder its own secret by being the first mention of it.
  //   termEp  — the EARLIEST gate. Prose may use a term from this episode on, because some earlier
  //             node has already introduced it.
  // Both are required: "Armored Titan" as Bertholdt's title at 31 is fine (max 31 <= 31), but the
  // same words as a title at 20 are not.
  const termEp = new Map<string, number>(); // lowercased term -> earliest episode any entity using it appears
  const termMax = new Map<string, number>(); // lowercased term -> latest gate it is known to appear at
  const addTerm = (t: string, ep: number) => {
    const k = t.trim().toLowerCase();
    if (k.length < 3) return;
    termEp.set(k, Math.min(termEp.get(k) ?? Infinity, ep));
    termMax.set(k, Math.max(termMax.get(k) ?? 0, ep));
  };
  for (const n of c.nodes) addTerm(n.title, n.watch_ep);
  for (const l of c.lanes) addTerm(l.label, l.watch_ep);
  for (const t of c.terms) addTerm(t.term, t.watch_ep);
  // Aliases use their OWN from_ep, never the node's watch_ep. addTerm takes the earliest episode a
  // term is safe, so "Jaw Titan" (Ymir at 31, Falco and Porco at 78) becomes vocabulary at 31, and
  // "Founding Titan" does not become vocabulary at all until 80 even though its node is visible at 1.
  for (const a of c.aliases) addTerm(a.alias, a.from_ep);

  const patterns = [...termEp].map(([term, ep]) => ({ term, ep, re: new RegExp(`(^|[^a-z0-9])${esc(term)}(?![a-z0-9])`, "i") }));
  const scan = (id: string, ep: number, field: string, text: string | null) => {
    if (!text) return;
    for (const p of patterns) {
      if (p.ep > ep && p.re.test(text)) error("SPOILER_COPY", id, `${field} (ep ${ep}) mentions "${p.term}", which first appears at ep ${p.ep}`);
    }
  };
  for (const n of c.nodes) {
    if (n.type === "event") {
      scan(n.id, n.watch_ep, "summary", n.summary);
      scan(n.id, n.watch_ep, "because", n.because);
      scan(n.id, n.watch_ep, "happened_in", n.happened_in);
      // TITLE_LEAK: a title renders on the canvas at all times, so it obeys the strict rule -- it may
      // only use terms whose LATEST gate is at or before this episode. Titles name the action or the
      // mystery, never the secret identity ("The Sky Fills", not "The Rumbling").
      for (const [term, latest] of termMax) {
        if (latest <= n.watch_ep) continue;
        if (new RegExp(`(^|[^a-z0-9])${esc(term)}(?![a-z0-9])`, "i").test(n.title))
          error("TITLE_LEAK", n.id, `title (ep ${n.watch_ep}) names "${term}", which is not known until ep ${latest}`);
      }
    } else if (n.type === "titan" || n.type === "concept" || n.type === "location") {
      scan(n.id, n.watch_ep, "summary", n.summary);
    }
  }
  for (const e of c.edges) scan(e.id, e.watch_ep, "why_text", e.why_text);
  for (const r of c.relationships ?? []) {
    const src = entityGate(r.source_id);
    const dst = entityGate(r.target_id);
    const gateEp = Math.max(r.visible_from_ep, src?.watch_ep ?? 1, dst?.watch_ep ?? 1);
    scan(r.id, gateEp, "label", r.label);
    scan(r.id, gateEp, "description", r.description);
  }
  for (const ep of c.event_participants ?? []) {
    const evt = nodes.get(ep.event_id);
    const gateEp = Math.max(ep.visible_from_ep, evt?.watch_ep ?? 1);
    scan(ep.id, gateEp, "notes", ep.notes);
  }
  for (const f of c.facts) scan(f.id, f.revealed_ep, "text", f.text);
  for (const g of c.goals) {
    const ch = nodes.get(g.character);
    const gateEp = ch ? Math.max(g.from_ep, ch.watch_ep) : g.from_ep;
    const key = g.id ?? g.character;
    scan(key, gateEp, "display_label", g.display_label);
    scan(key, gateEp, "goal", g.text);
    scan(key, gateEp, "fear", g.fear);
    scan(key, gateEp, "belief", g.belief);
  }

  // 6. STALE_EDGE: an edge gated far later than both of its endpoints reads as broken UI -- two
  // visible nodes sitting next to each other with no line. Warn, never error: a relationship may
  // legitimately only become meaningful much later (Reiner's split persona spans 17 to 84).
  const STALE_EDGE_THRESHOLD = 10;
  for (const e of c.edges) {
    const from = nodes.get(e.from);
    const to = nodes.get(e.to);
    if (!from || !to) continue; // REF_MISSING already reported
    const latest = Math.max(from.watch_ep, to.watch_ep);
    if (e.watch_ep > latest + STALE_EDGE_THRESHOLD)
      warn("STALE_EDGE", e.id, `unlocks at ep ${e.watch_ep}, more than ${STALE_EDGE_THRESHOLD} after its latest endpoint (ep ${latest})`);
  }

  return issues;
}

export const hasErrors = (issues: LintIssue[]) => issues.some((i) => i.severity === "error");
