import { create } from "zustand";
import { subscribeWithSelector } from "zustand/middleware";
import { EDGE_TYPES, type EdgeType } from "@/content/enums";
import type { CEpisode, CNode, GatedGraph } from "@/gate/types";
import { MAX_EDGE_LAYERS, type Lens } from "@/lib/viewState";

export interface TimelineState {
  graph: GatedGraph | null;
  episodes: CEpisode[];
  progress: number;
  cursor: number;
  lens: Lens;
  selectedNodeId: string | null;
  selectedCharId: string | null;
  fact: string | null;
  pov: string | null;
  edgeLayers: EdgeType[];
  zoom: 1 | 2 | 3;
  laneStart: number;
  isPlaying: boolean;
}

export interface TimelineActions {
  init: (graph: GatedGraph, episodes?: CEpisode[]) => void;
  setCursor: (ep: number) => void;
  selectNode: (id: string | null, ep?: number) => void;
  selectChar: (id: string | null) => void;
  setLens: (lens: Lens) => void;
  setFact: (id: string | null) => void;
  setPov: (id: string | null) => void;
  toggleEdge: (edge: EdgeType) => void;
  setZoom: (delta: 1 | -1) => void;
  setLaneStart: (start: number) => void;
  setIsPlaying: (playing: boolean) => void;
  stepCursor: (delta: 1 | -1) => void;
  returnToMain: () => void;
}

export type TimelineStore = TimelineState & TimelineActions;

const clampEp = (ep: number, progress: number) =>
  Math.max(Math.min(ep, progress), Math.min(1, progress));

export const useTimelineStore = create<TimelineStore>()(
  subscribeWithSelector((set, get) => ({
    graph: null,
    episodes: [],
    progress: 1,
    cursor: 1,
    lens: "timeline",
    selectedNodeId: null,
    selectedCharId: null,
    fact: null,
    pov: null,
    edgeLayers: [...EDGE_TYPES].slice(0, MAX_EDGE_LAYERS),
    zoom: 1,
    laneStart: 0,
    isPlaying: false,

    init: (graph, episodes = []) => {
      set({
        graph,
        episodes,
        progress: graph.progress,
        cursor: Math.max(graph.progress, 1),
      });
    },

    setCursor: (ep) => {
      const { progress } = get();
      set({ cursor: clampEp(ep, progress) });
    },

    selectNode: (id, ep) => {
      const { progress, cursor } = get();
      set({
        selectedNodeId: id,
        cursor: ep !== undefined ? clampEp(ep, progress) : cursor,
      });
    },

    selectChar: (id) => {
      const { lens } = get();
      set({
        selectedCharId: id,
        lens: id ? "character" : lens === "character" ? "timeline" : lens,
      });
    },

    setLens: (lens) => {
      if (lens === "timeline") {
        set({ lens: "timeline", selectedCharId: null, fact: null, pov: null });
      } else {
        set({ lens });
      }
    },

    setFact: (id) => set({ fact: id }),
    setPov: (id) => set({ pov: id }),

    toggleEdge: (edge) => {
      const { edgeLayers } = get();
      if (edgeLayers.includes(edge)) {
        set({ edgeLayers: edgeLayers.filter((e) => e !== edge) });
      } else if (edgeLayers.length < MAX_EDGE_LAYERS) {
        set({ edgeLayers: [...edgeLayers, edge] });
      }
    },

    setZoom: (delta) => {
      const { zoom } = get();
      const nextZoom = Math.min(3, Math.max(1, zoom + delta)) as 1 | 2 | 3;
      set({ zoom: nextZoom });
    },

    setLaneStart: (start) => set({ laneStart: Math.max(0, start) }),

    setIsPlaying: (playing) => set({ isPlaying: playing }),

    stepCursor: (delta) => {
      const { graph, cursor, progress, selectedNodeId } = get();
      if (!graph) return;
      const events = graph.nodes
        .filter((n): n is CNode => n.type === "event" && n.watchEp <= progress)
        .sort((a, b) => a.watchEp - b.watchEp || a.tier - b.tier || a.id.localeCompare(b.id));

      if (events.length === 0) return;

      const idx = selectedNodeId ? events.findIndex((e) => e.id === selectedNodeId) : -1;
      const target =
        idx >= 0
          ? events[idx + delta]
          : delta === 1
          ? events.find((e) => e.watchEp >= cursor)
          : [...events].reverse().find((e) => e.watchEp <= cursor);

      if (target) {
        set({ selectedNodeId: target.id, cursor: target.watchEp });
      } else {
        set({ cursor: clampEp(cursor + delta, progress) });
      }
    },

    returnToMain: () => {
      const { progress } = get();
      set({
        cursor: progress,
        lens: "timeline",
        selectedNodeId: null,
        selectedCharId: null,
        fact: null,
        pov: null,
        zoom: 1,
        isPlaying: false,
      });
    },
  }))
);
