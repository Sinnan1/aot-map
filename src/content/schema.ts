import { z } from "zod";
import { CONFIDENCE, DEPTH_LAYERS, EDGE_TYPES, EPISODE_TYPES, IMPORTANCE, KNOWLEDGE_STATES } from "./enums";

/**
 * Authoring schema (spec section 7). Field names follow the spec.
 * Additions beyond the spec are marked EXT:
 *   lanes.watch_ep      lanes are content too ("Yeagerists" is a spoiler for new viewers)
 *   nodes.tier          1 = primary, 2/3 = clustered first (powers the Rule of 7)
 *   nodes.participants  characters involved in an event (powers the Character lens)
 *   aliases[]           alternative names, gated independently of their node (aliases.json)
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
  // Character prominence. NOT nodes.tier, which is event-only (the Rule of 7 pool filters to
  // type === "event", so characters never compete for a canvas slot).
  importance: z.enum(IMPORTANCE).default("major"),
  /** One present-tense sentence. Must not describe anything later than watch_ep. */
  summary: z.string().min(1).nullable().default(null),
  // Server-side only. See the bio/tags/aliases note in src/db/schema.ts.
  bio: z.string().min(1).nullable().default(null),
  tags: z.array(z.string()).default([]),
  icon: z.string().nullable().default(null),
  color: z.string().nullable().default(null),
  source_url: z.url().nullable().default(null),
  lane_history: z.array(z.object({ from_ep: ep, lane: z.string() })).min(1),
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

/**
 * An alternative name for a node, gated independently of the node itself.
 *
 * from_ep is the episode the name becomes SAFE, which is usually later than the node's watch_ep:
 * "Founding Titan" belongs to a node visible from ep 1 but is not sayable until 80. It is never
 * earlier than the node's gate, which lint enforces (ALIAS_BEFORE_NODE).
 *
 * One row per (node, name): "Jaw Titan" is held by Ymir from 31, Falco from 78 and Porco from 78,
 * so a name cannot be keyed by itself.
 */
export const NodeAlias = z.object({
  node_id: slug("char"), // characters today; events may use it later
  alias: z.string().min(2),
  from_ep: ep,
});

/**
 * The episode spine (content/episodes.csv). episode_abs is the numbering authority: every
 * watch_ep / revealed_ep / from_ep value in the other content files is an episode_abs.
 * Row-local rules live here; cross-row rules live in lintEpisodes().
 */
export const Episode = z
  .object({
    episode_abs: z.number().int().min(1),
    season: z.number().int().min(1),
    part: z.number().int().min(1).nullable(),
    episode_in_part: z.number().int().min(1),
    title: z.string().min(1),
    arc: z.string().min(1),
    episode_type: z.enum(EPISODE_TYPES),
    summary: z.string().min(1).nullable(),
    source_url: z.url().nullable(),
  })
  .superRefine((e, ctx) => {
    if (e.episode_type === "special" && e.part !== null)
      ctx.addIssue({ code: "custom", message: "specials sit outside any part (part must be empty)", path: ["part"] });
    if (e.episode_type === "premiere" && e.episode_in_part !== 1)
      ctx.addIssue({ code: "custom", message: "a premiere opens its season, so episode_in_part must be 1", path: ["episode_in_part"] });
  });

export type EpisodeC = z.infer<typeof Episode>;

export const ContentSet = z.object({
  lanes: z.array(Lane),
  nodes: z.array(z.union([EventNode, CharacterNode])),
  edges: z.array(Edge),
  facts: z.array(Fact),
  knowledge_states: z.array(KnowledgeState),
  goals: z.array(Goal).default([]),
  terms: z.array(Term).default([]),
  aliases: z.array(NodeAlias).default([]), // EXT: names gated independently of their node
});

export type ContentSet = z.infer<typeof ContentSet>;
export type LaneC = z.infer<typeof Lane>;
export type NodeAliasC = z.infer<typeof NodeAlias>;
export type NodeC = ContentSet["nodes"][number];
export type EventNodeC = Extract<NodeC, { type: "event" }>;
export type CharacterNodeC = Extract<NodeC, { type: "character" }>;
