import { boolean, index, integer, jsonb, pgEnum, pgTable, primaryKey, serial, smallint, text, uniqueIndex, type AnyPgColumn } from "drizzle-orm/pg-core";
import { CONFIDENCE, DEPTH_LAYERS, EDGE_TYPES, EPISODE_TYPES, EVENT_TYPES, IMPORTANCE, KNOWLEDGE_STATES, PARTICIPANT_ROLES, RELATIONSHIP_TYPES } from "@/content/enums";

/**
 * Every table that holds viewer-visible content carries an episode gate column
 * (watch_ep / revealed_ep / from_ep). Nothing reads these tables without going through src/gate/queries.ts.
 *
 * The episode spine: episode_abs is the single numbering authority for the whole app.
 * Every gate column in the other tables is an episode_abs value; there is deliberately no FK
 * to it (see content/slice/README.md: gate columns are a spoiler coordinate, not a reference).
 */
export const confidenceEnum = pgEnum("confidence", CONFIDENCE);
export const edgeTypeEnum = pgEnum("edge_type", EDGE_TYPES);
export const knowledgeStateEnum = pgEnum("knowledge_state", KNOWLEDGE_STATES);
export const depthLayerEnum = pgEnum("depth_layer", DEPTH_LAYERS);
export const nodeTypeEnum = pgEnum("node_type", ["event", "character", "titan", "concept", "location"]);
export const importanceEnum = pgEnum("importance", IMPORTANCE);
export const episodeTypeEnum = pgEnum("episode_type", EPISODE_TYPES);
export const relationshipTypeEnum = pgEnum("relationship_type", RELATIONSHIP_TYPES);
export const eventTypeEnum = pgEnum("event_type", EVENT_TYPES);
export const participantRoleEnum = pgEnum("participant_role", PARTICIPANT_ROLES);

export const episodes = pgTable(
  "episodes",
  {
    /** Absolute episode number, 1..FINALE_EP. The spine every other gate column points at. */
    episodeAbs: integer("episode_abs").primaryKey(),
    season: integer("season").notNull(),
    /** Disc batches (S1 parts 1-2, S3 parts 1-2, S4 parts 1-2). Null for unparted seasons and specials. */
    part: integer("part"),
    episodeInPart: integer("episode_in_part").notNull(),
    title: text("title").notNull(),
    arc: text("arc").notNull(),
    episodeType: episodeTypeEnum("episode_type").notNull().default("normal"),
    summary: text("summary"),
    sourceUrl: text("source_url"),
  },
  (t) => [
    index("episodes_season_idx").on(t.season),
    index("episodes_arc_idx").on(t.arc),
    uniqueIndex("episodes_season_part_order_idx").on(t.season, t.part, t.episodeInPart),
  ],
);

export const lanes = pgTable("lanes", {
  id: text("id").primaryKey(),
  label: text("label").notNull(),
  sort: integer("sort").notNull(),
  watchEp: integer("watch_ep").notNull(),
});

export const nodes = pgTable(
  "nodes",
  {
    id: text("id").primaryKey(),
    type: nodeTypeEnum("type").notNull(),
    title: text("title").notNull(), // character name for characters
    shortLabel: text("short_label"),
    eventType: eventTypeEnum("event_type"),
    season: integer("season"),
    episodeAbsStart: integer("episode_abs_start"),
    episodeAbsEnd: integer("episode_abs_end"),
    arc: text("arc"),
    factionLane: text("faction_lane").references(() => lanes.id),
    watchEp: integer("watch_ep").notNull(),
    storyOrder: integer("story_order"), // Rewatch mode only. Never selected by the gate queries.
    isFlashback: boolean("is_flashback").notNull().default(false),
    happenedIn: text("happened_in"),
    confidence: confidenceEnum("confidence").notNull(),
    depthLayer: depthLayerEnum("depth_layer").notNull().default("surface"),
    /** Event-only: the Rule of 7 primary/clustered split. Never set on characters. */
    tier: smallint("tier").notNull().default(2),
    /** Prominence scale (core/major/minor). */
    importance: importanceEnum("importance"),
    summary: text("summary"),
    whyItMatters: text("why_it_matters"),
    because: text("because"),
    setupRef: text("setup_ref").references((): AnyPgColumn => nodes.id),
    voidPos: jsonb("void_pos").$type<{ x: number; y: number; z: number } | null>(),
    locationId: text("location_id"),

    // Reference copy, server-side only. NOT in the gated client payload: bio and tags are
    // written with whole-series knowledge (Hange's bio mentions succeeding Erwin; Eren's tags
    // say "yeagerists"), so they spoil against any gate the row can carry. They need their own
    // per-field gate before the character panel can read them.
    bio: text("bio"),
    tags: text("tags").array().notNull().default([]),
    icon: text("icon"),
    color: text("color"),
    sourceUrl: text("source_url"),
  },
  (t) => [index("nodes_watch_ep_idx").on(t.watchEp)],
);

export const nodeParticipants = pgTable(
  "node_participants",
  {
    nodeId: text("node_id").notNull().references(() => nodes.id),
    characterId: text("character_id").notNull().references(() => nodes.id),
  },
  (t) => [primaryKey({ columns: [t.nodeId, t.characterId] })],
);

export const laneHistory = pgTable(
  "lane_history",
  {
    characterId: text("character_id").notNull().references(() => nodes.id),
    fromEp: integer("from_ep").notNull(),
    laneId: text("lane_id").notNull().references(() => lanes.id),
  },
  (t) => [primaryKey({ columns: [t.characterId, t.fromEp] })],
);

/**
 * Alternative names, gated independently of the node they belong to.
 *
 * from_ep is a spoiler gate, not a bookkeeping column: "Founding Titan" belongs to a node visible
 * from ep 1 but is not safe to read until 80. Never earlier than the node's watch_ep (the lint
 * enforces it). Keyed on (node_id, alias) because one name can be held by several characters on
 * different timelines.
 *
 * Server-side only: the client gets alias text through gated search, never through the graph
 * payload. See nodeAliasesSearch in src/gate/queries.ts.
 */
export const nodeAliases = pgTable(
  "node_aliases",
  {
    id: serial("id").primaryKey(),
    nodeId: text("node_id").notNull().references(() => nodes.id),
    alias: text("alias").notNull(),
    fromEp: integer("from_ep").notNull(),
  },
  (t) => [
    uniqueIndex("node_aliases_node_alias_uidx").on(t.nodeId, t.alias),
    index("node_aliases_from_ep_idx").on(t.fromEp),
    index("node_aliases_alias_idx").on(t.alias),
  ],
);

export const edges = pgTable(
  "edges",
  {
    id: text("id").primaryKey(),
    fromId: text("from_id").notNull().references(() => nodes.id),
    toId: text("to_id").notNull().references(() => nodes.id),
    type: edgeTypeEnum("type").notNull(),
    watchEp: integer("watch_ep").notNull(),
    confidence: confidenceEnum("confidence").notNull(),
    whyText: text("why_text").notNull(),
  },
  (t) => [index("edges_watch_ep_idx").on(t.watchEp)],
);

export const facts = pgTable("facts", {
  id: text("id").primaryKey(),
  text: text("text").notNull(),
  revealedEp: integer("revealed_ep").notNull(),
});

/** holder is a character id or a lane id, so there is deliberately no FK. Lint enforces it. */
export const knowledgeStates = pgTable(
  "knowledge_states",
  {
    id: serial("id").primaryKey(),
    holder: text("holder").notNull(),
    factId: text("fact_id").notNull().references(() => facts.id),
    state: knowledgeStateEnum("state").notNull(),
    fromEp: integer("from_ep").notNull(),
    toEp: integer("to_ep"), // half-open: holds while from_ep <= ep < to_ep
    confidence: confidenceEnum("confidence").notNull(),
  },
  (t) => [index("knowledge_from_ep_idx").on(t.fromEp)],
);

export const characterGoals = pgTable("character_goals", {
  id: serial("id").primaryKey(),
  stateId: text("state_id"),
  characterId: text("character_id").notNull().references(() => nodes.id),
  phaseName: text("phase_name"),
  displayLabel: text("display_label"),
  text: text("text").notNull(),
  fear: text("fear"),
  belief: text("belief"),
  // Server-side only: secret and spoiler_notes contain whole-phase or series-wide reveals
  // (e.g. Phase 1 secrets name Reiner as an undercover Warrior and Historia as Rod Reiss's daughter).
  secret: text("secret"),
  spoilerNotes: text("spoiler_notes"),
  sourceUrl: text("source_url"),
  fromEp: integer("from_ep").notNull(),
  toEp: integer("to_ep"),
  confidence: confidenceEnum("confidence").notNull(),
});

/** source_id and target_id can be a node id or a lane id (like knowledgeStates.holder); lint enforces existence. */
export const relationships = pgTable(
  "relationships",
  {
    id: text("id").primaryKey(),
    sourceId: text("source_id").notNull(),
    targetId: text("target_id").notNull(),
    relationshipType: relationshipTypeEnum("relationship_type").notNull(),
    label: text("label").notNull(),
    // Server-side / rewatch-only: true_from_ep can be Ep 1 even when the relationship is revealed later.
    trueFromEp: integer("true_from_ep").notNull(),
    visibleFromEp: integer("visible_from_ep").notNull(),
    expiresEp: integer("expires_ep"),
    confidence: confidenceEnum("confidence").notNull(),
    description: text("description").notNull(),
    sourceUrl: text("source_url"),
  },
  (t) => [index("relationships_visible_from_ep_idx").on(t.visibleFromEp)],
);

/** entity_id can be a character in nodes.json or a supporting character id; lint enforces valid format and event_id FK. */
export const eventParticipants = pgTable(
  "event_participants",
  {
    id: text("id").primaryKey(),
    eventId: text("event_id").notNull().references(() => nodes.id),
    entityId: text("entity_id").notNull(),
    role: participantRoleEnum("role").notNull(),
    visibleFromEp: integer("visible_from_ep").notNull(),
    notes: text("notes").notNull(),
    sourceUrl: text("source_url"),
  },
  (t) => [
    index("event_participants_event_id_idx").on(t.eventId),
    index("event_participants_visible_from_ep_idx").on(t.visibleFromEp),
  ],
);

