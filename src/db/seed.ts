import type { ContentSet } from "@/content/schema";
import * as t from "./schema";
import type { DB } from "./types";

/** Replaces all content in one transaction. Idempotent: run it on every content release. */
export async function seedContent(db: DB, c: ContentSet): Promise<void> {
  await db.transaction(async (tx) => {
    await tx.delete(t.eventParticipants);
    await tx.delete(t.relationships);
    await tx.delete(t.characterGoals);
    await tx.delete(t.knowledgeStates);
    await tx.delete(t.facts);
    await tx.delete(t.edges);
    await tx.delete(t.laneHistory);
    await tx.delete(t.nodeParticipants);
    await tx.delete(t.nodeAliases); // FK to nodes, so it must go before them
    await tx.update(t.nodes).set({ setupRef: null });
    await tx.delete(t.nodes);
    await tx.delete(t.lanes);

    if (c.lanes.length) await tx.insert(t.lanes).values(c.lanes.map((l) => ({ id: l.id, label: l.label, sort: l.sort, watchEp: l.watch_ep })));

    if (c.nodes.length)
      await tx.insert(t.nodes).values(
        c.nodes.map((n) =>
          n.type === "event"
            ? {
                id: n.id, type: "event" as const, title: n.title,
                shortLabel: n.short_label ?? null, eventType: n.event_type ?? null, season: n.season ?? null,
                episodeAbsStart: n.episode_abs_start ?? null, episodeAbsEnd: n.episode_abs_end ?? null, arc: n.arc ?? null,
                factionLane: n.faction_lane, watchEp: n.watch_ep,
                storyOrder: n.story_order, isFlashback: n.is_flashback, happenedIn: n.happened_in, confidence: n.confidence,
                depthLayer: n.depth_layer, tier: n.tier, importance: n.importance ?? null,
                summary: n.summary, whyItMatters: n.why_it_matters ?? null, because: n.because, setupRef: n.setup_ref,
                voidPos: n.void_pos, locationId: n.location_id ?? null,
                tags: n.tags ?? [], sourceUrl: n.source_url ?? null,
              }
            : {
                id: n.id, type: n.type, title: n.title, factionLane: null, watchEp: n.watch_ep, storyOrder: null,
                isFlashback: false, happenedIn: null, confidence: n.confidence, depthLayer: "surface" as const,
                // Characters and Titans never enter the Rule of 7 pool (placeEvents filters to events), so tier is
                // not theirs to set. Prominence is importance instead.
                tier: 2,
                importance: n.importance,
                summary: n.summary, because: null, setupRef: null, voidPos: null,
                bio: n.bio, tags: n.tags, icon: n.icon, color: n.color, sourceUrl: n.source_url,
              },
        ),
      );

    const participants = c.nodes.flatMap((n) => (n.type === "event" ? n.participants.map((p) => ({ nodeId: n.id, characterId: p })) : []));
    if (participants.length) await tx.insert(t.nodeParticipants).values(participants);

    const history = c.nodes.flatMap((n) => (n.type === "character" ? n.lane_history.map((h) => ({ characterId: n.id, fromEp: h.from_ep, laneId: h.lane })) : []));
    if (history.length) await tx.insert(t.laneHistory).values(history);

    if (c.edges.length)
      await tx.insert(t.edges).values(c.edges.map((e) => ({ id: e.id, fromId: e.from, toId: e.to, type: e.type, watchEp: e.watch_ep, confidence: e.confidence, whyText: e.why_text })));
    if (c.facts.length) await tx.insert(t.facts).values(c.facts.map((f) => ({ id: f.id, text: f.text, revealedEp: f.revealed_ep })));
    if (c.knowledge_states.length)
      await tx.insert(t.knowledgeStates).values(c.knowledge_states.map((k) => ({ holder: k.holder, factId: k.fact, state: k.state, fromEp: k.from_ep, toEp: k.to_ep, confidence: k.confidence })));
    if (c.goals.length)
      await tx.insert(t.characterGoals).values(
        c.goals.map((g) => ({
          stateId: g.id,
          characterId: g.character,
          phaseName: g.phase_name,
          displayLabel: g.display_label,
          text: g.text,
          fear: g.fear,
          belief: g.belief,
          secret: g.secret,
          spoilerNotes: g.spoiler_notes,
          sourceUrl: g.source_url,
          fromEp: g.from_ep,
          toEp: g.to_ep,
          confidence: g.confidence,
        })),
      );

    if (c.aliases.length) await tx.insert(t.nodeAliases).values(c.aliases.map((a) => ({ nodeId: a.node_id, alias: a.alias, fromEp: a.from_ep })));
    if (c.relationships.length)
      await tx.insert(t.relationships).values(
        c.relationships.map((r) => ({
          id: r.id,
          sourceId: r.source_id,
          targetId: r.target_id,
          relationshipType: r.relationship_type,
          label: r.label,
          trueFromEp: r.true_from_ep,
          visibleFromEp: r.visible_from_ep,
          expiresEp: r.expires_ep,
          confidence: r.confidence,
          description: r.description,
          sourceUrl: r.source_url,
        })),
      );

    if (c.event_participants?.length)
      await tx.insert(t.eventParticipants).values(
        c.event_participants.map((ep) => ({
          id: ep.id,
          eventId: ep.event_id,
          entityId: ep.entity_id,
          role: ep.role,
          visibleFromEp: ep.visible_from_ep,
          notes: ep.notes,
          sourceUrl: ep.source_url,
        })),
      );
  });
}
