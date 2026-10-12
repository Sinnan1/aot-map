import { EDGE_TYPES, type EdgeType } from "@/content/enums";

export type Lens = "timeline" | "who_knows" | "character" | "why";
export const MAX_EDGE_LAYERS = 3; // Rule 3

export interface ViewState {
  progress: number; // the gate; the cursor can never pass it
  cursor: number; // the "you are here" episode
  lens: Lens;
  selectedNode: string | null;
  selectedChar: string | null;
  fact: string | null;
  pov: string | null;
  edgeLayers: EdgeType[];
  zoom: 1 | 2 | 3;
  laneStart: number; // first visible lane on phones
}

export type Action =
  | { type: "progress"; progress: number }
  | { type: "cursor"; ep: number }
  | { type: "select_node"; id: string | null; ep?: number }
  | { type: "select_char"; id: string | null }
  | { type: "lens"; lens: Lens }
  | { type: "fact"; id: string | null }
  | { type: "pov"; id: string | null }
  | { type: "toggle_edge"; edge: EdgeType }
  | { type: "zoom"; delta: 1 | -1 }
  | { type: "lane_start"; start: number }
  | { type: "return_main" };

export const initialView = (progress: number): ViewState => ({
  progress, cursor: Math.max(progress, 0), lens: "timeline", selectedNode: null, selectedChar: null,
  fact: null, pov: null, edgeLayers: [...EDGE_TYPES].slice(0, MAX_EDGE_LAYERS), zoom: 1, laneStart: 0,
});

const clampEp = (ep: number, progress: number) => Math.max(Math.min(ep, progress), Math.min(1, progress));

export function viewReducer(s: ViewState, a: Action): ViewState {
  switch (a.type) {
    case "progress":
      // Follow the frontier if the viewer was sitting on it.
      return { ...s, progress: a.progress, cursor: s.cursor === s.progress ? a.progress : clampEp(s.cursor, a.progress) };
    case "cursor":
      return { ...s, cursor: clampEp(a.ep, s.progress) };
    case "select_node":
      return { ...s, selectedNode: a.id, cursor: a.ep !== undefined ? clampEp(a.ep, s.progress) : s.cursor };
    case "select_char":
      return { ...s, selectedChar: a.id, lens: a.id ? "character" : s.lens === "character" ? "timeline" : s.lens };
    case "lens":
      return a.lens === "timeline"
        ? { ...s, lens: "timeline", selectedChar: null, fact: null, pov: null }
        : { ...s, lens: a.lens };
    case "fact":
      return { ...s, fact: a.id };
    case "pov":
      return { ...s, pov: a.id };
    case "toggle_edge": {
      if (s.edgeLayers.includes(a.edge)) return { ...s, edgeLayers: s.edgeLayers.filter((e) => e !== a.edge) };
      return s.edgeLayers.length >= MAX_EDGE_LAYERS ? s : { ...s, edgeLayers: [...s.edgeLayers, a.edge] };
    }
    case "zoom":
      return { ...s, zoom: Math.min(3, Math.max(1, s.zoom + a.delta)) as 1 | 2 | 3 };
    case "lane_start":
      return { ...s, laneStart: Math.max(0, a.start) };
    case "return_main":
      return { ...s, cursor: s.progress, lens: "timeline", selectedNode: null, selectedChar: null, fact: null, pov: null, zoom: 1 };
  }
}
