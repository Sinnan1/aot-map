// No zod import here: safe to bundle into the client.
export const CONFIDENCE = ["shown", "implied", "interpretation"] as const;
export const EDGE_TYPES = ["causes", "alliance", "secret"] as const;
export const KNOWLEDGE_STATES = ["knows", "not_knows", "believes_falsely", "hides"] as const;
export const DEPTH_LAYERS = ["surface", "paths"] as const;

export type Confidence = (typeof CONFIDENCE)[number];
export type EdgeType = (typeof EDGE_TYPES)[number];
export type KState = (typeof KNOWLEDGE_STATES)[number];
export type DepthLayer = (typeof DEPTH_LAYERS)[number];
