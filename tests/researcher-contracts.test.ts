import { describe, expect, it } from "vitest";
import { EDGE_TYPES, IMPORTANCE, KNOWLEDGE_STATES } from "@/content/enums";
import { hasErrors, lintContent } from "@/content/lint";
import { ContentSet, type ContentSet as ContentSetT } from "@/content/schema";
import { makeDb, sample } from "./helpers";

const fresh = (): ContentSetT => structuredClone(sample());
const codes = (c: ContentSetT) => lintContent(c).filter((i) => i.severity === "error").map((i) => i.code);
const warns = (c: ContentSetT) => lintContent(c).filter((i) => i.severity === "warn").map((i) => i.code);
const evt = (c: ContentSetT, id: string) => c.nodes.find((n) => n.id === id && n.type === "event")!;

/**
 * These tests pin the contracts the researcher brief states. They are the executable half of
 * content/RESEARCHER-BRIEF.md: if a rule below ever disagrees with that document, one of the two
 * is wrong and this is what catches it.
 */
describe("TITLE_LEAK: a title renders on the canvas, so it obeys the strict rule", () => {
  it("rejects a title naming a term that is not known yet", () => {
    const c = fresh();
    evt(c, "evt_liberio_zone").title = "Beast Titan"; // lane unlocks 23, but "Beast Titan" as an alias is ep 74
    expect(codes(c)).toContain("TITLE_LEAK");
  });

  it("allows a title once the term is known, even at the exact episode", () => {
    const c = fresh();
    // "Beast Titan" reaches its latest gate at 74, so a title at 74 is safe.
    evt(c, "evt_liberio_zone").watch_ep = 74;
    evt(c, "evt_liberio_zone").title = "Beast Titan";
    expect(codes(c)).not.toContain("TITLE_LEAK");
  });

  it("does not let a node launder its own secret by being the first mention", () => {
    // "Rumbling" appears in no title or alias today, so add it as a term gated late.
    const c = fresh();
    c.terms.push({ term: "Rumbling", watch_ep: 80 });
    const n = evt(c, "evt_liberio_zone");
    n.title = "The Rumbling Begins"; // node is at 60, the term is not known until 80
    expect(codes(c)).toContain("TITLE_LEAK");
  });

  it("uses the LATEST gate for titles and the EARLIEST for prose", () => {
    // Same term, two gates: an alias at 80 and a title at 5. Prose may use it from 5 (someone
    // introduced it earlier); a title may not.
    const c = fresh();
    c.aliases.push({ node_id: "char_eren", alias: "Late Revealed Thing", from_ep: 80 });
    const n = evt(c, "evt_life_inside_walls"); // ep 1
    n.summary = "Nobody has mentioned the Late Revealed Thing yet.";
    expect(codes(c)).toContain("SPOILER_COPY");

    const d = fresh();
    d.aliases.push({ node_id: "char_eren", alias: "Late Revealed Thing", from_ep: 80 });
    const m = evt(d, "evt_life_inside_walls");
    m.title = "The Late Revealed Thing";
    expect(codes(d)).toContain("TITLE_LEAK");
  });

  it("the real slice titles are clean", () => {
    expect(codes(fresh())).not.toContain("TITLE_LEAK");
  });
});

describe("STALE_EDGE", () => {
  it("warns when an edge unlocks long after both endpoints", () => {
    const c = fresh();
    // edge_walls_to_world joins ep 1 to ep 59, so it cannot be made stale without moving endpoints.
    const e = c.edges.find((x) => x.id === "edge_walls_to_walls") ?? c.edges[0]!;
    e.watch_ep = 89;
    c.nodes = c.nodes.map((n) => (n.id === "evt_world_beyond_walls" ? { ...n, watch_ep: 1 } : n));
    expect(warns(c)).toContain("STALE_EDGE");
  });

  it("stays quiet just inside the threshold, and never errors", () => {
    const near = fresh();
    const e0 = near.edges[0]!;
    const latest = Math.max(...near.nodes.filter((n) => n.id === e0.from || n.id === e0.to).map((n) => n.watch_ep));
    e0.watch_ep = latest + 10;
    expect(warns(near)).not.toContain("STALE_EDGE");

    const far = fresh();
    far.edges[0]!.watch_ep = latest + 11;
    const issues = lintContent(far).filter((i) => i.id === far.edges[0]!.id && i.code === "STALE_EDGE");
    expect(issues).toHaveLength(1);
    expect(issues[0]!.severity).toBe("warn"); // a legitimately late relationship is not an error
  });

  it("does not warn on an edge gated at its own endpoints", () => {
    expect(warns(fresh())).not.toContain("STALE_EDGE");
  });
});

describe("characters carry importance, not tier", () => {
  it("importance is a closed enum and never reaches the Rule of 7 pool", () => {
    expect(IMPORTANCE).toEqual(["core", "major", "minor"]);
    const c = fresh();
    const chars = c.nodes.filter((n) => n.type === "character");
    expect(chars.length).toBeGreaterThan(0);
    expect(chars.every((n) => IMPORTANCE.includes(n.importance))).toBe(true);
    expect(chars.every((n) => !("tier" in n))).toBe(true);
  });

  it("a character at high importance does not change the event layout", async () => {
    // The Rule of 7 pool comes from placeEvents(), which filters to events. Promoting every
    // character to the strongest prominence must not move a single primary slot.
    const { placeEvents, selectPrimary } = await import("@/components/ribbon/layout");
    const { loadGatedGraph } = await import("@/gate/queries");
    const { makeGate } = await import("@/gate/gate");

    const db = await makeDb(sample());
    const before = await loadGatedGraph(db, makeGate({ progress: 89 }));
    const lanes = before.lanes.map((l) => l.id);
    const placed = placeEvents(before.nodes, lanes, 1);
    const a = selectPrimary(placed, -Infinity, Infinity, 7, new Set(), 400);

    const promoted = { ...before, nodes: before.nodes.map((n) => (n.type === "character" ? { ...n, tier: 1 as const } : n)) };
    const placed2 = placeEvents(promoted.nodes, lanes, 1);
    const b = selectPrimary(placed2, -Infinity, Infinity, 7, new Set(), 400);

    expect(b.primary.map((p) => p.node.id)).toEqual(a.primary.map((p) => p.node.id));
  });
});

describe("researcher field contracts", () => {
  it("edge and knowledge enums are lowercase and closed", () => {
    // The brief quotes CAUSES and DOES_NOT_KNOW; both must fail rather than silently coerce.
    expect(EDGE_TYPES).toEqual(["causes", "alliance", "secret"]);
    expect(KNOWLEDGE_STATES).toEqual(["knows", "not_knows", "believes_falsely", "hides"]);

    const c = fresh();
    c.edges[0]!.type = "CAUSES" as never;
    expect(() => ContentSet.parse(c)).toThrow();

    const d = fresh();
    d.knowledge_states[0]!.state = "DOES_NOT_KNOW" as never;
    expect(() => ContentSet.parse(d)).toThrow();
  });

  it("knowledge states use holder/fact and from_ep/to_ep, not subject/object/watch_ep", () => {
    const c = fresh();
    expect(() => ContentSet.parse({ ...c, knowledge_states: [{ subject: "char_eren", object: "evt_x", state: "not_knows", watch_ep: 60, expires_ep: 80 }] })).toThrow();
    // The documented shape parses.
    const ok = ContentSet.parse({ ...c, knowledge_states: [{ holder: "char_eren", fact: "fact_world_beyond_walls", state: "not_knows", from_ep: 60, to_ep: 80, confidence: "shown" }] });
    expect(hasErrors(lintContent(ok as ContentSetT))).toBe(false);
  });

  it("knowledge state ranges are half-open and must advance", () => {
    const c = fresh();
    const k = c.knowledge_states[0]!;
    k.to_ep = k.from_ep; // to_ep must be strictly greater
    expect(codes(c)).toContain("RANGE");
  });

  it("an edge before either endpoint is still GATE_ORDER", () => {
    const c = fresh();
    const e = c.edges[0]!;
    const to = c.nodes.find((n) => n.id === e.to)!;
    e.watch_ep = 1;
    to.watch_ep = 59;
    expect(codes(c)).toContain("GATE_ORDER");
  });

  it("edges require a one-sentence why_text", () => {
    const c = fresh();
    c.edges[0]!.why_text = "First sentence. Second sentence.";
    expect(warns(c)).toContain("ONE_SENTENCE");

    const d = fresh();
    d.edges[0]!.why_text = "";
    expect(() => ContentSet.parse(d)).toThrow();
  });

  it("an event with a because needs a visible causes edge into it", () => {
    const c = fresh();
    c.edges = c.edges.filter((e) => e.to !== "evt_declaration_of_war");
    expect(codes(c)).toContain("BECAUSE_UNBACKED");
  });

  it("the sample still lints clean with both new rules active", () => {
    const issues = lintContent(sample());
    expect(issues.filter((i) => i.severity === "error")).toEqual([]);
  });
});