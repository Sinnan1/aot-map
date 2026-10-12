import { z } from "zod";
import { CONFIDENCE, DEPTH_LAYERS, EDGE_TYPES, KNOWLEDGE_STATES } from "./enums";

/**
 * Authoring schema (spec section 7). Field names follow the spec.
 * Additions beyond the spec are marked EXT:
 *   lanes.watch_ep      lanes are content too ("Yeagerists" is a spoiler for new viewers)
 *   nodes.tier          1 = primary, 2/3 = clustered first (powers the Rule of 7)
 *   nodes.participants  characters involved in an event (powers the Character lens)
 *   nodes.aliases       extra names the spoiler lint should watch for
 *   goals[]             character goals shown in the node detail panel
 *   terms[]             spoiler glossary for words that are not nodes
 */
const ep = z.number().int().min(1);
const slug = (prefix: string) =>
  z.string().regex(new RegExp(`^${prefix}_[a-z0-9_]+$`), `id must look like ${prefix}_snake_case`);
const confidence = z.enum(CONFIDENCE);

export const Lane = z.object({
  id: z.string().regex(/^[a-z_]+$/),
  label: z.string().min(1),
  sort: z.number().int(),
  watch_ep: ep, // EXT
});

const EventNode = z
  .object({
    id: slug("evt"),
    type: z.literal("event"),
    title: z.string().min(1),
    faction_lane: z.string(),
    watch_ep: ep,
    story_order: z.number().int().nullable(), // stored for Rewatch mode; never sent to the client
    is_flashback: z.boolean(),
    happened_in: z.string().nullable().default(null), // "happened in/around: [label]"
    confidence,
    depth_layer: z.enum(DEPTH_LAYERS),
    tier: z.union([z.literal(1), z.literal(2), z.literal(3)]).default(2), // EXT
    summary: z.string().min(1),
    because: z.string().nullable(), // null only for root events
    setup_ref: slug("evt").nullable().default(null),
    void_pos: z.object({ x: z.number(), y: z.number(), z: z.number() }).nullable().default(null),
    participants: z.array(slug("char")).default([]), // EXT
    aliases: z.array(z.string()).default([]), // EXT
  })
  .superRefine((n, ctx) => {
    if (n.is_flashback && !n.happened_in)
      ctx.addIssue({ code: "custom", message: "flashbacks need happened_in", path: ["happened_in"] });
    if (!n.is_flashback && n.happened_in)
      ctx.addIssue({ code: "custom", message: "happened_in is only for flashbacks", path: ["happened_in"] });
    if (n.depth_layer === "paths" && !n.void_pos)
      ctx.addIssue({ code: "custom", message: "paths nodes need void_pos", path: ["void_pos"] });
  });

const CharacterNode = z.object({
  id: slug("char"),
  type: z.literal("character"),
  title: z.string().min(1),
  watch_ep: ep,
  confidence: confidence.default("shown"),
  lane_history: z.array(z.object({ from_ep: ep, lane: z.string() })).min(1),
  aliases: z.array(z.string()).default([]),
});

export const Edge = z.object({
  id: slug("edge"),
  from: z.string(),
  to: z.string(),
  type: z.enum(EDGE_TYPES),
  watch_ep: ep,
  confidence,
  why_text: z.string().min(1),
});

export const Fact = z.object({ id: slug("fact"), text: z.string().min(1), revealed_ep: ep });

export const KnowledgeState = z.object({
  holder: z.string(), // character id or lane id
  fact: slug("fact"),
  state: z.enum(KNOWLEDGE_STATES),
  from_ep: ep,
  to_ep: ep.nullable(), // half-open: state holds for from_ep <= ep < to_ep; null = still holds
  confidence,
});

export const Goal = z.object({
  character: slug("char"),
  text: z.string().min(1),
  from_ep: ep,
  to_ep: ep.nullable(),
  confidence,
});

export const Term = z.object({ term: z.string().min(3), watch_ep: ep });

export const ContentSet = z.object({
  lanes: z.array(Lane),
  nodes: z.array(z.union([EventNode, CharacterNode])),
  edges: z.array(Edge),
  facts: z.array(Fact),
  knowledge_states: z.array(KnowledgeState),
  goals: z.array(Goal).default([]),
  terms: z.array(Term).default([]),
});

export type ContentSet = z.infer<typeof ContentSet>;
export type LaneC = z.infer<typeof Lane>;
export type NodeC = ContentSet["nodes"][number];
export type EventNodeC = Extract<NodeC, { type: "event" }>;
export type CharacterNodeC = Extract<NodeC, { type: "character" }>;
