import { describe, expect, it } from "vitest";
import { makeGate } from "@/gate/gate";
import { loadGatedGraph } from "@/gate/queries";
import type { CNode, GatedGraph } from "@/gate/types";
import { activeGoals, characterRoute, knowledgeMatrix, holdersAt, laneOfCharacter, stateAt, whyTrace } from "@/lib/lenses";
import { initialView, viewReducer } from "@/lib/viewState";
import { episodeToX, placeEvents, selectPrimary, xToEpisode } from "@/components/ribbon/layout";
import { makeDb, sample } from "./helpers";

let g: GatedGraph;
const load = async (progress: number) => loadGatedGraph(await makeDb(sample()), makeGate({ progress }));

describe("lenses", () => {
  it("Who Knows What reads state at the cursor episode", async () => {
    g = await load(64);
    expect(stateAt(g, "char_gabi", "fact_paradis_not_devils", 64)).toBe("believes_falsely");
    expect(stateAt(g, "char_reiner", "fact_paradis_not_devils", 64)).toBe("knows");
    expect(stateAt(g, "char_eren", "fact_paradis_not_devils", 64)).toBe("not_knows"); // no row = does not know
    expect(stateAt(g, "char_gabi", "fact_paradis_not_devils", 59)).toBe("not_knows");
    const rows = knowledgeMatrix(g, 59, holdersAt(g, 59));
    expect(rows.map((r) => r.fact.id)).toEqual(["fact_world_beyond_walls"]); // later fact absent at ep 59
  });

  it("Why Mode traces causes backward and effects forward", async () => {
    g = await load(64);
    const t = whyTrace(g, "evt_world_beyond_walls", false);
    expect([...t.causes]).toEqual(["evt_life_inside_walls"]);
    expect([...t.effects]).toEqual(["evt_declaration_of_war"]);
    expect(t.edges).toHaveLength(2);
  });

  it("Why Mode ignores theory edges unless allowed", async () => {
    g = await load(64);
    const withTheory: GatedGraph = { ...g, edges: g.edges.map((e) => (e.id === "edge_world_to_declaration" ? { ...e, confidence: "interpretation" as const } : e)) };
    expect(whyTrace(withTheory, "evt_world_beyond_walls", false).effects.size).toBe(0);
    expect(whyTrace(withTheory, "evt_world_beyond_walls", true).effects.size).toBe(1);
  });

  it("Character lens: route, lane hops, goals", async () => {
    g = await load(64);
    expect([...characterRoute(g, "char_gabi")].sort()).toEqual(["char_gabi", "evt_liberio_zone", "evt_warrior_candidates"]);
    expect(laneOfCharacter(g, "char_reiner", 59)).toBe("scouts");
    expect(laneOfCharacter(g, "char_reiner", 60)).toBe("warriors");
    expect(activeGoals(g, "char_gabi", 59)).toHaveLength(0);
    expect(activeGoals(g, "char_gabi", 60)).toHaveLength(1);
  });
});

describe("view state", () => {
  it("never lets the cursor pass the gate", () => {
    const s = viewReducer(initialView(64), { type: "cursor", ep: 80 });
    expect(s.cursor).toBe(64);
  });
  it("follows the frontier when progress advances, but not if the viewer scrubbed back", () => {
    expect(viewReducer(initialView(64), { type: "progress", progress: 65 }).cursor).toBe(65);
    const back = viewReducer(initialView(64), { type: "cursor", ep: 61 });
    expect(viewReducer(back, { type: "progress", progress: 65 }).cursor).toBe(61);
  });
  it("Rule 3: at most 3 active edge layers", () => {
    let s = initialView(64);
    s = viewReducer(s, { type: "toggle_edge", edge: "secret" }); // removes
    expect(s.edgeLayers).toEqual(["causes", "alliance"]);
    s = viewReducer(s, { type: "toggle_edge", edge: "secret" });
    expect(s.edgeLayers).toHaveLength(3);
  });
  it("Return to Main Thread resets lens, selection and cursor", () => {
    let s = viewReducer(initialView(64), { type: "select_char", id: "char_gabi" });
    s = viewReducer(s, { type: "cursor", ep: 60 });
    s = viewReducer(s, { type: "return_main" });
    expect(s).toMatchObject({ cursor: 64, lens: "timeline", selectedChar: null, selectedNode: null });
  });
});

describe("ribbon layout", () => {
  it("round-trips episode <-> x in both zones", () => {
    for (const ep of [1, 30, 59, 60, 64, 80]) expect(Math.round(xToEpisode(episodeToX(ep, 1), 1))).toBe(ep);
  });
  it("Rule of 7: never more than the cap primary at default zoom, overflow clusters per lane", () => {
    const nodes: CNode[] = Array.from({ length: 20 }, (_, i) => ({
      id: `evt_${i}`, type: "event", title: `E${i}`, lane: i % 2 ? "a" : "b", watchEp: 60 + Math.floor(i / 5), isFlashback: false, happenedIn: null,
      confidence: "shown", depth: "surface", tier: i % 3 === 0 ? 1 : 2, summary: "s", because: null, setupRef: null, voidPos: null, participants: [],
    }));
    const placed = placeEvents(nodes, ["a", "b"], 1);
    const { primary, clusters } = selectPrimary(placed, 0, 5000, 7, new Set(), 600);
    expect(primary.length).toBeLessThanOrEqual(7);
    expect(clusters.reduce((n, c) => n + c.ids.length, 0)).toBe(20 - primary.length);
    expect(clusters.length).toBeLessThanOrEqual(2);
  });
  it("never moves earlier nodes when later episodes unlock", () => {
    const mk = (id: string, ep: number): CNode => ({ id, type: "event", title: id, lane: "a", watchEp: ep, isFlashback: false, happenedIn: null, confidence: "shown", depth: "surface", tier: 1, summary: "s", because: null, setupRef: null, voidPos: null, participants: [] });
    const before = placeEvents([mk("x", 60), mk("y", 60)], ["a"], 1);
    const after = placeEvents([mk("x", 60), mk("y", 60), mk("z", 61)], ["a"], 1);
    expect(after.slice(0, 2).map((p) => p.x)).toEqual(before.map((p) => p.x));
  });
});
