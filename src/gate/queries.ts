import { and, eq, ilike, inArray, lte, or, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import * as t from "@/db/schema";
import type { DB } from "@/db/types";
import { allowedConfidence, type Gate } from "./gate";
import type { CNode, CEpisode, GatedGraph, SearchHit } from "./types";

/**
 * THE gate. Every read of viewer-visible content goes through here.
 *  1. SQL filters rows by watch_ep / revealed_ep / from_ep <= progress and by confidence.
 *  2. Future end-episodes are nulled in SQL (a state ending at ep 70 reads "still holds" at ep 64).
 *  3. assemble() drops anything that points at something the gate removed.
 * Columns are selected explicitly so story_order and aliases can never leak by accident.
 */
export async function loadGatedGraph(db: DB, gate: Gate): Promise<GatedGraph> {
  const p = gate.progress;
  const base = { progress: p, theories: gate.theories, rewatch: gate.rewatch };
  if (p < 1) return { ...base, lanes: [], nodes: [], edges: [], facts: [], knowledge: [], goals: [], laneHistory: [] };

  const conf = allowedConfidence(gate);
  const ch = alias(t.nodes, "ch");
  const nf = alias(t.nodes, "nf");
  const nt = alias(t.nodes, "nt");
  const clampTo = (col: typeof t.knowledgeStates.toEp | typeof t.characterGoals.toEp) =>
    sql<number | null>`case when ${col} > ${p} then null else ${col} end`;

  const [laneRows, nodeRows, partRows, histRows, edgeRows, factRows, stateRows, goalRows] = await Promise.all([
    db.select({ id: t.lanes.id, label: t.lanes.label, sort: t.lanes.sort }).from(t.lanes).where(lte(t.lanes.watchEp, p)).orderBy(t.lanes.sort),

    db
      .select({
        id: t.nodes.id, type: t.nodes.type, title: t.nodes.title, lane: t.nodes.factionLane, watchEp: t.nodes.watchEp,
        isFlashback: t.nodes.isFlashback, happenedIn: t.nodes.happenedIn, confidence: t.nodes.confidence,
        depth: t.nodes.depthLayer, tier: t.nodes.tier, summary: t.nodes.summary, because: t.nodes.because, setupRef: t.nodes.setupRef, voidPos: t.nodes.voidPos,
      })
      .from(t.nodes)
      .where(and(lte(t.nodes.watchEp, p), inArray(t.nodes.confidence, conf)))
      .orderBy(t.nodes.watchEp, t.nodes.id),

    db
      .select({ nodeId: t.nodeParticipants.nodeId, characterId: t.nodeParticipants.characterId })
      .from(t.nodeParticipants)
      .innerJoin(t.nodes, eq(t.nodes.id, t.nodeParticipants.nodeId))
      .innerJoin(ch, eq(ch.id, t.nodeParticipants.characterId))
      .where(and(lte(t.nodes.watchEp, p), lte(ch.watchEp, p), inArray(t.nodes.confidence, conf), inArray(ch.confidence, conf))),

    db
      .select({ character: t.laneHistory.characterId, fromEp: t.laneHistory.fromEp, lane: t.laneHistory.laneId })
      .from(t.laneHistory)
      .innerJoin(t.lanes, eq(t.lanes.id, t.laneHistory.laneId))
      .innerJoin(ch, eq(ch.id, t.laneHistory.characterId))
      .where(and(lte(t.laneHistory.fromEp, p), lte(t.lanes.watchEp, p), lte(ch.watchEp, p), inArray(ch.confidence, conf)))
      .orderBy(t.laneHistory.characterId, t.laneHistory.fromEp),

    db
      .select({ id: t.edges.id, from: t.edges.fromId, to: t.edges.toId, type: t.edges.type, watchEp: t.edges.watchEp, confidence: t.edges.confidence, whyText: t.edges.whyText })
      .from(t.edges)
      .innerJoin(nf, eq(nf.id, t.edges.fromId))
      .innerJoin(nt, eq(nt.id, t.edges.toId))
      .where(and(lte(t.edges.watchEp, p), lte(nf.watchEp, p), lte(nt.watchEp, p), inArray(t.edges.confidence, conf), inArray(nf.confidence, conf), inArray(nt.confidence, conf))),

    db.select({ id: t.facts.id, text: t.facts.text, revealedEp: t.facts.revealedEp }).from(t.facts).where(lte(t.facts.revealedEp, p)),

    db
      .select({ holder: t.knowledgeStates.holder, fact: t.knowledgeStates.factId, state: t.knowledgeStates.state, fromEp: t.knowledgeStates.fromEp, toEp: clampTo(t.knowledgeStates.toEp), confidence: t.knowledgeStates.confidence })
      .from(t.knowledgeStates)
      .innerJoin(t.facts, eq(t.facts.id, t.knowledgeStates.factId))
      .where(and(lte(t.knowledgeStates.fromEp, p), lte(t.facts.revealedEp, p), inArray(t.knowledgeStates.confidence, conf))),

    db
      .select({ character: t.characterGoals.characterId, text: t.characterGoals.text, fromEp: t.characterGoals.fromEp, toEp: clampTo(t.characterGoals.toEp), confidence: t.characterGoals.confidence })
      .from(t.characterGoals)
      .innerJoin(ch, eq(ch.id, t.characterGoals.characterId))
      .where(and(lte(t.characterGoals.fromEp, p), lte(ch.watchEp, p), inArray(t.characterGoals.confidence, conf))),
  ]);

  // assemble(): drop dangling references so nothing points at a node the gate removed.
  const nodeIds = new Set(nodeRows.map((n) => n.id));
  const charIds = new Set(nodeRows.filter((n) => n.type === "character").map((n) => n.id));
  const laneIds = new Set(laneRows.map((l) => l.id));
  const factIds = new Set(factRows.map((f) => f.id));

  const participants = new Map<string, string[]>();
  for (const r of partRows) participants.set(r.nodeId, [...(participants.get(r.nodeId) ?? []), r.characterId]);

  const nodes: CNode[] = nodeRows
    .filter((n) => n.type === "character" || (n.lane !== null && laneIds.has(n.lane)))
    .map((n) => ({
      ...n,
      tier: n.tier as 1 | 2 | 3,
      setupRef: n.setupRef && nodeIds.has(n.setupRef) ? n.setupRef : null,
      participants: participants.get(n.id) ?? [],
    }));

  return {
    ...base,
    lanes: laneRows,
    nodes,
    edges: edgeRows,
    facts: factRows,
    knowledge: stateRows.filter((k) => factIds.has(k.fact) && (charIds.has(k.holder) || laneIds.has(k.holder))),
    goals: goalRows.filter((g) => charIds.has(g.character)),
    laneHistory: histRows.filter((h) => charIds.has(h.character) && laneIds.has(h.lane)),
  };
}

/**
 * The episode spine, gated.
 *
 * This table is the only content table whose gate column is its own primary key rather than a
 * watch_ep column, so it gets its own query instead of riding in loadGatedGraph(). A row is
 * only visible once the viewer has watched that episode: at ep 26 the row is withheld, because
 * the title alone ("Beast Titan") and ep 89's summary both give away plot.
 */
export async function loadGatedEpisodes(db: DB, gate: Gate): Promise<CEpisode[]> {
  return db
    .select({
      episodeAbs: t.episodes.episodeAbs,
      season: t.episodes.season,
      part: t.episodes.part,
      episodeInPart: t.episodes.episodeInPart,
      title: t.episodes.title,
      arc: t.episodes.arc,
      episodeType: t.episodes.episodeType,
      summary: t.episodes.summary,
      sourceUrl: t.episodes.sourceUrl,
    })
    .from(t.episodes)
    .where(lte(t.episodes.episodeAbs, gate.progress))
    .orderBy(t.episodes.episodeAbs);
}

/** Gated search. The index never contains anything past the viewer's progress. */
export async function searchGated(db: DB, gate: Gate, q: string, limit = 8): Promise<SearchHit[]> {
  const term = q.trim().slice(0, 80);
  if (term.length < 2 || gate.progress < 1) return [];
  const like = `%${term.replace(/[\\%_]/g, "\\$&")}%`;
  const rows = await db
    .select({ id: t.nodes.id, title: t.nodes.title, watchEp: t.nodes.watchEp, type: t.nodes.type })
    .from(t.nodes)
    .where(
      and(
        lte(t.nodes.watchEp, gate.progress),
        inArray(t.nodes.confidence, allowedConfidence(gate)),
        or(
          ilike(t.nodes.title, like),
          ilike(t.nodes.summary, like),
          sql`to_tsvector('english', ${t.nodes.title} || ' ' || coalesce(${t.nodes.summary}, '')) @@ plainto_tsquery('english', ${term})`,
        ),
      ),
    )
    .orderBy(t.nodes.watchEp, t.nodes.title)
    .limit(limit);
  return rows;
}
