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
  for (const id of [...c.lanes, ...c.nodes, ...c.edges, ...c.facts].map((x) => x.id)) {
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
    } else {
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
  for (const g of c.goals) {
    const ch = nodes.get(g.character);
    if (!ch || ch.type !== "character") error("REF_MISSING", g.character, "goal character does not exist");
    else if (g.from_ep < ch.watch_ep) error("GATE_ORDER", g.character, `goal starts at ep ${g.from_ep}, before the character appears (ep ${ch.watch_ep})`);
    if (g.to_ep !== null && g.to_ep <= g.from_ep) error("RANGE", g.character, "goal to_ep must be greater than from_ep");
  }

  // 5. Spoiler lint: copy may not mention anything with a later watch_ep.
  const termEp = new Map<string, number>(); // lowercased term -> earliest episode any entity using it appears
  const addTerm = (t: string, ep: number) => {
    const k = t.trim().toLowerCase();
    if (k.length < 3) return;
    termEp.set(k, Math.min(termEp.get(k) ?? Infinity, ep));
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
    }
  }
  for (const e of c.edges) scan(e.id, e.watch_ep, "why_text", e.why_text);
  for (const f of c.facts) scan(f.id, f.revealed_ep, "text", f.text);
  for (const g of c.goals) scan(g.character, g.from_ep, "goal", g.text);

  return issues;
}

export const hasErrors = (issues: LintIssue[]) => issues.some((i) => i.severity === "error");
