// No zod import here: safe to bundle into the client.
export const CONFIDENCE = ["shown", "implied", "interpretation"] as const;
export const EDGE_TYPES = ["causes", "alliance", "secret"] as const;
export const KNOWLEDGE_STATES = ["knows", "not_knows", "believes_falsely", "hides"] as const;
export const DEPTH_LAYERS = ["surface", "paths"] as const;

/**
 * Episode role. "normal" is the default; the others mark the episodes that carry a
 * structural beat (season openers, arc closers, identity reveals, the Final Chapters).
 */
export const EPISODE_TYPES = ["normal", "premiere", "finale", "reveal", "special", "recap"] as const;

/**
 * Character prominence: how much the cast matters to the story, independent of canvas budget.
 *
 * Distinct from nodes.tier, which is an EVENT-only field. The Rule of 7 pool is built by
 * placeEvents(), which filters to type === "event", so characters never compete for a slot and
 * need no canvas priority of their own.
 */
export const IMPORTANCE = ["core", "major", "minor"] as const;

export type Confidence = (typeof CONFIDENCE)[number];
export type EdgeType = (typeof EDGE_TYPES)[number];
export type KState = (typeof KNOWLEDGE_STATES)[number];
export type DepthLayer = (typeof DEPTH_LAYERS)[number];
export type EpisodeType = (typeof EPISODE_TYPES)[number];
export type Importance = (typeof IMPORTANCE)[number];
