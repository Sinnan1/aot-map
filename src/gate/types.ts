import type { Confidence, EdgeType, EpisodeType, KState } from "@/content/enums";

/**
 * Everything here is what the CLIENT receives. It is already gated.
 * Deliberately absent: story_order, aliases, future to_ep values, locked lanes, locked facts.
 */
export interface CLane { id: string; label: string; sort: number }

export interface CNode {
  id: string;
  type: "event" | "character" | "titan" | "concept" | "location";
  title: string;
  lane: string | null; // events only
  watchEp: number;
  isFlashback: boolean;
  happenedIn: string | null;
  confidence: Confidence;
  depth: "surface" | "paths";
  tier: 1 | 2 | 3;
  summary: string | null;
  because: string | null;
  setupRef: string | null;
  voidPos: { x: number; y: number; z: number } | null; // Paths nodes only
  participants: string[];
}

export interface CEdge { id: string; from: string; to: string; type: EdgeType; watchEp: number; confidence: Confidence; whyText: string }
export interface CFact { id: string; text: string; revealedEp: number }
export interface CKnowledge { holder: string; fact: string; state: KState; fromEp: number; toEp: number | null; confidence: Confidence }
export interface CGoal { character: string; text: string; fromEp: number; toEp: number | null; confidence: Confidence }
export interface CLaneStep { character: string; fromEp: number; lane: string }

export interface GatedGraph {
  progress: number;
  theories: boolean;
  rewatch: boolean;
  lanes: CLane[];
  nodes: CNode[];
  edges: CEdge[];
  facts: CFact[];
  knowledge: CKnowledge[];
  goals: CGoal[];
  laneHistory: CLaneStep[];
}

export interface SearchHit { id: string; title: string; watchEp: number; type: "event" | "character" | "titan" | "concept" | "location" }

/**
 * A watched episode. Gated on episode_abs, so an unwatched viewer never receives a row: the
 * title ("Beast Titan", ep 26) and the summary (ep 89 gives away the ending) are both spoilers
 * until the episode itself has been seen.
 */
export interface CEpisode {
  episodeAbs: number;
  season: number;
  part: number | null;
  episodeInPart: number;
  title: string;
  arc: string;
  episodeType: EpisodeType;
  summary: string | null;
  sourceUrl: string | null;
}
