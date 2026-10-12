import { boolean, index, integer, jsonb, pgEnum, pgTable, primaryKey, serial, smallint, text, type AnyPgColumn } from "drizzle-orm/pg-core";
import { CONFIDENCE, DEPTH_LAYERS, EDGE_TYPES, KNOWLEDGE_STATES } from "@/content/enums";

/**
 * Every table that holds viewer-visible content carries an episode gate column
 * (watch_ep / revealed_ep / from_ep). Nothing reads these tables without going through src/gate/queries.ts.
 */
export const confidenceEnum = pgEnum("confidence", CONFIDENCE);
export const edgeTypeEnum = pgEnum("edge_type", EDGE_TYPES);
export const knowledgeStateEnum = pgEnum("knowledge_state", KNOWLEDGE_STATES);
export const depthLayerEnum = pgEnum("depth_layer", DEPTH_LAYERS);
export const nodeTypeEnum = pgEnum("node_type", ["event", "character"]);

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
    factionLane: text("faction_lane").references(() => lanes.id),
    watchEp: integer("watch_ep").notNull(),
    storyOrder: integer("story_order"), // Rewatch mode only. Never selected by the gate queries.
    isFlashback: boolean("is_flashback").notNull().default(false),
    happenedIn: text("happened_in"),
    confidence: confidenceEnum("confidence").notNull(),
    depthLayer: depthLayerEnum("depth_layer").notNull().default("surface"),
    tier: smallint("tier").notNull().default(2),
    summary: text("summary"),
    because: text("because"),
    setupRef: text("setup_ref").references((): AnyPgColumn => nodes.id),
    voidPos: jsonb("void_pos").$type<{ x: number; y: number; z: number } | null>(),
    aliases: text("aliases").array().notNull().default([]),
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
  characterId: text("character_id").notNull().references(() => nodes.id),
  text: text("text").notNull(),
  fromEp: integer("from_ep").notNull(),
  toEp: integer("to_ep"),
  confidence: confidenceEnum("confidence").notNull(),
});
