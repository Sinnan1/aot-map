import { describe, expect, it } from "vitest";
import { hasErrors, lintContent } from "@/content/lint";
import type { ContentSet, EventNodeC } from "@/content/schema";
import { sample } from "./helpers";

const codes = (c: ContentSet) => lintContent(c).filter((i) => i.severity === "error").map((i) => i.code);
const evt = (c: ContentSet, id: string) => c.nodes.find((n) => n.id === id) as EventNodeC;
const fresh = () => structuredClone(sample());

describe("content lint", () => {
  it("passes the sample slice", () => {
    expect(hasErrors(lintContent(sample()))).toBe(false);
  });

  it("SPOILER_COPY: copy may not name something that appears later", () => {
    const c = fresh();
    evt(c, "evt_warrior_candidates").summary = "Candidates compete, years before the Declaration of War.";
    expect(codes(c)).toContain("SPOILER_COPY");
  });

  it("SPOILER_COPY: catches glossary terms and lane names", () => {
    const c = fresh();
    c.terms.push({ term: "the Rumbling", watch_ep: 80 });
    evt(c, "evt_declaration_of_war").summary = "Eren sets the Rumbling in motion.";
    expect(codes(c)).toContain("SPOILER_COPY");

    const d = fresh();
    evt(d, "evt_life_inside_walls").summary = "Humanity hides behind Walls while Warriors watch.";
    expect(codes(d)).toContain("SPOILER_COPY"); // "Warriors" lane label unlocks at ep 60
  });

  it("BECAUSE_UNBACKED: every because needs a visible causal edge", () => {
    const c = fresh();
    c.edges = c.edges.filter((e) => e.to !== "evt_declaration_of_war");
    expect(codes(c)).toContain("BECAUSE_UNBACKED");
  });

  it("GATE_ORDER: setup_ref, participants and edges cannot point forward in watch order", () => {
    const a = fresh();
    evt(a, "evt_world_beyond_walls").setup_ref = "evt_declaration_of_war";
    expect(codes(a)).toContain("GATE_ORDER");

    const b = fresh();
    evt(b, "evt_liberio_zone").participants.push("char_eren");
    evt(b, "evt_life_inside_walls").participants = ["char_gabi"]; // gabi appears at ep 60
    expect(codes(b)).toContain("GATE_ORDER");

    const e = fresh();
    e.edges[2]!.watch_ep = 61; // endpoint is ep 64
    expect(codes(e)).toContain("GATE_ORDER");
  });

  it("LANE_NOT_UNLOCKED: nothing may use a lane before it unlocks", () => {
    const c = fresh();
    evt(c, "evt_world_beyond_walls").faction_lane = "marley_military"; // unlocks at ep 60, node is 59
    expect(codes(c)).toContain("LANE_NOT_UNLOCKED");
  });

  it("knowledge states: fact order, ranges, overlaps", () => {
    const a = fresh();
    a.knowledge_states[0]!.from_ep = 58; // fact is revealed at 59
    expect(codes(a)).toContain("GATE_ORDER");

    const b = fresh();
    b.knowledge_states[0]!.to_ep = 59;
    expect(codes(b)).toContain("RANGE");

    const c = fresh();
    c.knowledge_states.push({ ...c.knowledge_states[0]!, state: "hides", from_ep: 62 });
    expect(codes(c)).toContain("STATE_OVERLAP");
  });

  it("lane_history must be ordered and start at the character's first episode", () => {
    const c = fresh();
    const gabi = c.nodes.find((n) => n.id === "char_gabi");
    if (gabi?.type === "character") gabi.lane_history = [{ from_ep: 61, lane: "warriors" }];
    expect(codes(c)).toContain("HISTORY_START");
  });

  it("REF_MISSING and DUPLICATE_ID", () => {
    const c = fresh();
    c.edges[0]!.to = "evt_nope";
    c.facts.push({ ...c.facts[0]! });
    const found = codes(c);
    expect(found).toContain("REF_MISSING");
    expect(found).toContain("DUPLICATE_ID");
  });

  it("warns on multi-sentence summaries", () => {
    const c = fresh();
    evt(c, "evt_life_inside_walls").summary = "One thing happens. Then another thing happens.";
    expect(lintContent(c).some((i) => i.code === "ONE_SENTENCE")).toBe(true);
  });
});
