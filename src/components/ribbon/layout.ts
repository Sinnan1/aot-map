import { SEASON4_FIRST_EP } from "@/config";
import type { CNode } from "@/gate/types";

export const LANE_H = 112;
export const HEADER_H = 34;
export const EP_W = 104; // px per episode in the Season 4 zone at zoom 1
export const FOUNDATION_W = 420; // the compressed "Previously" cluster
export const ZONE_GAP = 84;
export const MIN_NODE_GAP = 52;
export const ZOOM_FACTOR = { 1: 1, 2: 1.7, 3: 2.6 } as const;
export type Zoom = keyof typeof ZOOM_FACTOR;

/** X in the Time-Ribbon. Foundation episodes are compressed into one cluster; Season 4 is episode-linear. */
export function episodeToX(ep: number, zoom: Zoom): number {
  const f = ZOOM_FACTOR[zoom];
  if (ep < SEASON4_FIRST_EP) return ((ep - 1) / (SEASON4_FIRST_EP - 2)) * FOUNDATION_W * f;
  return (FOUNDATION_W + ZONE_GAP + (ep - SEASON4_FIRST_EP) * EP_W) * f;
}

export function xToEpisode(x: number, zoom: Zoom): number {
  const f = ZOOM_FACTOR[zoom];
  const u = x / f;
  if (u < FOUNDATION_W + ZONE_GAP / 2) return 1 + (Math.max(u, 0) / FOUNDATION_W) * (SEASON4_FIRST_EP - 2);
  return SEASON4_FIRST_EP + (u - FOUNDATION_W - ZONE_GAP) / EP_W;
}

export interface Placed { node: CNode; x: number; laneIndex: number }

/** Deterministic placement. Nudging only ever pushes LATER nodes right, so unlocking an episode never moves earlier nodes. */
export function placeEvents(nodes: CNode[], laneIds: string[], zoom: Zoom): Placed[] {
  const out: Placed[] = [];
  const lastX = new Map<string, number>();
  const events = nodes
    .filter((n) => n.type === "event" && n.depth === "surface" && n.lane && laneIds.includes(n.lane))
    .sort((a, b) => a.watchEp - b.watchEp || a.tier - b.tier || a.id.localeCompare(b.id));
  for (const n of events) {
    const lane = n.lane!;
    let x = episodeToX(n.watchEp, zoom);
    const prev = lastX.get(lane);
    if (prev !== undefined && x < prev + MIN_NODE_GAP) x = prev + MIN_NODE_GAP;
    lastX.set(lane, x);
    out.push({ node: n, x, laneIndex: laneIds.indexOf(lane) });
  }
  return out;
}

export interface Cluster { laneIndex: number; x: number; ids: string[]; fromEp: number }

/**
 * Rule of 7 (5 on phones). Within the viewport, the top-ranked nodes stay primary;
 * the rest collapse into one cluster chip per lane. `keep` ids (selection, trace members) are never clustered.
 */
export function selectPrimary(placed: Placed[], viewLeft: number, viewRight: number, cap: number, keep: Set<string>, anchorX: number) {
  const inView = placed.filter((p) => p.x >= viewLeft - 24 && p.x <= viewRight + 24);
  const ranked = [...inView].sort((a, b) => a.node.tier - b.node.tier || Math.abs(a.x - anchorX) - Math.abs(b.x - anchorX));
  const primaryIds = new Set(ranked.slice(0, cap).map((p) => p.node.id));
  keep.forEach((id) => primaryIds.add(id));
  const primary = inView.filter((p) => primaryIds.has(p.node.id));
  const grouped = new Map<number, Placed[]>();
  for (const p of inView) if (!primaryIds.has(p.node.id)) grouped.set(p.laneIndex, [...(grouped.get(p.laneIndex) ?? []), p]);
  const clusters: Cluster[] = [...grouped].map(([laneIndex, list]) => ({
    laneIndex,
    x: list.reduce((s, p) => s + p.x, 0) / list.length,
    ids: list.map((p) => p.node.id),
    fromEp: Math.min(...list.map((p) => p.node.watchEp)),
  }));
  return { primary, clusters };
}
