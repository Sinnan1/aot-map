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

export type Confidence = (typeof CONFIDENCE)[number];
export type EdgeType = (typeof EDGE_TYPES)[number];
export type KState = (typeof KNOWLEDGE_STATES)[number];
export type DepthLayer = (typeof DEPTH_LAYERS)[number];
export type EpisodeType = (typeof EPISODE_TYPES)[number];
