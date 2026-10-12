import type { EdgeType, KState } from "@/content/enums";
import type { CEdge, CFact, CGoal, CNode, GatedGraph } from "@/gate/types";

/** All lens functions are pure and run on the already-gated graph, so they cannot leak what the gate removed. */

export function stateAt(g: GatedGraph, holder: string, fact: string, ep: number): KState {
  const k = g.knowledge.find((s) => s.holder === holder && s.fact === fact && s.fromEp <= ep && (s.toEp === null || ep < s.toEp));
  return k?.state ?? "not_knows";
}

export interface Holder { id: string; label: string; kind: "character" | "faction" }

export function holdersAt(g: GatedGraph, ep: number): Holder[] {
  const chars = g.nodes.filter((n) => n.type === "character" && n.watchEp <= ep).map((n) => ({ id: n.id, label: n.title, kind: "character" as const }));
  const factions = g.lanes.filter((l) => g.knowledge.some((k) => k.holder === l.id)).map((l) => ({ id: l.id, label: l.label, kind: "faction" as const }));
  return [...chars, ...factions];
}

export interface MatrixRow { fact: CFact; cells: Record<string, KState> }

/** Who Knows What: facts the viewer has seen by `ep`, with each holder's state at `ep`. */
export function knowledgeMatrix(g: GatedGraph, ep: number, holders: Holder[]): MatrixRow[] {
  return g.facts
    .filter((f) => f.revealedEp <= ep)
    .map((fact) => ({ fact, cells: Object.fromEntries(holders.map((h) => [h.id, stateAt(g, h.id, fact.id, ep)])) }));
}

export interface Trace { causes: Set<string>; effects: Set<string>; edges: CEdge[] }

/** Why Mode: backward trace of root causes and forward trace of consequences over `causes` edges. */
export function whyTrace(g: GatedGraph, nodeId: string, allowTheories: boolean): Trace {
  const usable = g.edges.filter((e) => e.type === "causes" && (allowTheories || e.confidence !== "interpretation"));
  const walk = (dir: "back" | "fwd") => {
    const found = new Set<string>();
    const used: CEdge[] = [];
    let frontier = [nodeId];
    while (frontier.length) {
      const next: string[] = [];
      for (const e of usable) {
        const hit = dir === "back" ? frontier.includes(e.to) : frontier.includes(e.from);
        const other = dir === "back" ? e.from : e.to;
        if (hit && other !== nodeId && !found.has(other)) {
          found.add(other);
          next.push(other);
        }
        if (hit) used.push(e);
      }
      frontier = next;
    }
    return { found, used };
  };
  const back = walk("back");
  const fwd = walk("fwd");
  return { causes: back.found, effects: fwd.found, edges: [...new Set([...back.used, ...fwd.used])] };
}

/** Everything directly connected to a node, for Rule 2 contextual fading. */
export function connected(g: GatedGraph, nodeId: string): Set<string> {
  const out = new Set<string>([nodeId]);
  for (const e of g.edges) {
    if (e.from === nodeId) out.add(e.to);
    if (e.to === nodeId) out.add(e.from);
  }
  const n = g.nodes.find((x) => x.id === nodeId);
  if (n?.setupRef) out.add(n.setupRef);
  n?.participants.forEach((p) => out.add(p));
  return out;
}

/** Character lens: the character plus every event they take part in. */
export function characterRoute(g: GatedGraph, charId: string): Set<string> {
  const out = new Set<string>([charId]);
  for (const n of g.nodes) if (n.type === "event" && n.participants.includes(charId)) out.add(n.id);
  return out;
}

export function laneOfCharacter(g: GatedGraph, charId: string, ep: number): string | null {
  const steps = g.laneHistory.filter((h) => h.character === charId && h.fromEp <= ep);
  return steps.length ? steps[steps.length - 1]!.lane : null;
}

export function activeGoals(g: GatedGraph, charId: string, ep: number): CGoal[] {
  return g.goals.filter((x) => x.character === charId && x.fromEp <= ep && (x.toEp === null || ep < x.toEp));
}

export function edgesTouching(g: GatedGraph, nodeId: string, layers: EdgeType[]): CEdge[] {
  return g.edges.filter((e) => layers.includes(e.type) && (e.from === nodeId || e.to === nodeId));
}

export const byWatchEp = (a: CNode, b: CNode) => a.watchEp - b.watchEp || a.id.localeCompare(b.id);
