import { beforeAll, describe, expect, it } from "vitest";
import { makeGate } from "@/gate/gate";
import { loadGatedGraph, searchGated } from "@/gate/queries";
import type { DB } from "@/db/types";
import { makeDb, withFuture } from "./helpers";

let db: DB;
beforeAll(async () => {
  const c = withFuture();
  // Two knowledge states for the same holder+fact would trip the lint, so seed directly (the DB layer must hold regardless).
  c.knowledge_states = c.knowledge_states.filter((k) => !(k.holder === "char_gabi" && k.fact === "fact_world_beyond_walls" && k.state === "knows"));
  db = await makeDb(c);
});

const ids = (g: { nodes: { id: string }[] }) => g.nodes.map((n) => n.id).sort();

describe("episode gate", () => {
  it("new viewers (progress 0) get an empty graph", async () => {
    const g = await loadGatedGraph(db, makeGate({ progress: 0 }));
    expect(g.nodes).toEqual([]);
    expect(g.lanes).toEqual([]);
  });

  it("locks lanes, nodes, edges, facts until their episode", async () => {
    const at59 = await loadGatedGraph(db, makeGate({ progress: 59 }));
    // Lanes unlock on their own watch_ep: Marley Military opens at 60, so it must be absent.
    expect(at59.lanes.map((l) => l.id)).not.toContain("marley_military");
    expect(ids(at59)).toEqual(expect.arrayContaining(["char_eren", "char_reiner", "evt_life_inside_walls", "evt_world_beyond_walls"]));
    // The rule, not a content list: nothing past the gate, and the ep-60+ characters stay sealed.
    expect(at59.nodes.every((n) => n.watchEp <= 59)).toBe(true);
    expect(ids(at59)).not.toContain("char_gabi"); // gated at 63
    expect(ids(at59)).not.toContain("char_zeke"); // gated at 74
    expect(at59.facts.map((f) => f.id)).toEqual(["fact_world_beyond_walls"]);

    const at64 = await loadGatedGraph(db, makeGate({ progress: 64 }));
    expect(ids(at64)).toContain("evt_declaration_of_war");
    expect(ids(at64)).toContain("char_gabi");
    expect(ids(at64)).not.toContain("char_zeke"); // still sealed at 64
    expect(ids(at64)).not.toContain("evt_late_event");
    expect(ids(at64)).not.toContain("char_late");
    expect(at64.lanes.map((l) => l.id)).not.toContain("yeagerists");
    expect(at64.edges.map((e) => e.id)).not.toContain("edge_declaration_to_late");
    expect(at64.facts.map((f) => f.id)).not.toContain("fact_late");
  });

  it("opens later items exactly at their watch_ep", async () => {
    const at70 = await loadGatedGraph(db, makeGate({ progress: 70 }));
    expect(ids(at70)).toContain("evt_late_event");
    expect(at70.lanes.map((l) => l.id)).toContain("yeagerists");
    expect(at70.edges.map((e) => e.id)).toContain("edge_declaration_to_late");
  });

  it("clamps future end-episodes so the client cannot see a state will change", async () => {
    const at64 = await loadGatedGraph(db, makeGate({ progress: 64 }));
    const gabi = at64.knowledge.find((k) => k.holder === "char_gabi" && k.state === "not_knows");
    expect(gabi?.toEp).toBeNull();
    const at72 = await loadGatedGraph(db, makeGate({ progress: 72 }));
    expect(at72.knowledge.find((k) => k.holder === "char_gabi" && k.state === "not_knows")?.toEp).toBe(72);
  });

  it("removes participants and setup refs that point past the gate", async () => {
    const at64 = await loadGatedGraph(db, makeGate({ progress: 64 }));
    expect(at64.nodes.find((n) => n.id === "evt_declaration_of_war")?.participants).toEqual(["char_eren"]);
    const at70 = await loadGatedGraph(db, makeGate({ progress: 70 }));
    expect(at70.nodes.find((n) => n.id === "evt_late_event")?.participants.sort()).toEqual(["char_eren", "char_late"]);
  });

  it("hides interpretation-level items unless theories are on", async () => {
    const off = await loadGatedGraph(db, makeGate({ progress: 64 }));
    expect(ids(off)).not.toContain("evt_theory_event");
    const on = await loadGatedGraph(db, makeGate({ progress: 64, theories: true }));
    expect(ids(on)).toContain("evt_theory_event");
  });

  it("never sends story_order or aliases, and the payload holds no future text", async () => {
    const g = await loadGatedGraph(db, makeGate({ progress: 64 }));
    const json = JSON.stringify(g);
    expect(json).not.toContain("story_order");
    expect(json).not.toContain("storyOrder");
    expect(json).not.toContain("aliases");
    for (const needle of ["Late Event", "only ep 70", "Yeagerists", "A late reveal", "Late Character"]) expect(json).not.toContain(needle);
  });

  it("rewatch mode shows everything", async () => {
    const g = await loadGatedGraph(db, makeGate({ rewatch: true }));
    expect(ids(g)).toContain("evt_late_event");
  });
});

describe("gated search", () => {
  it("finds visible items", async () => {
    const hits = await searchGated(db, makeGate({ progress: 64 }), "declaration");
    expect(hits.map((h) => h.id)).toEqual(["evt_declaration_of_war"]);
  });
  it("never returns items past the gate, by title or by body text", async () => {
    const g = makeGate({ progress: 64 });
    expect(await searchGated(db, g, "Late Event")).toEqual([]);
    expect(await searchGated(db, g, "ep 70 viewers")).toEqual([]);
    expect((await searchGated(db, makeGate({ progress: 70 }), "Late Event")).map((h) => h.id)).toEqual(["evt_late_event"]);
  });
  it("treats % and _ literally", async () => {
    expect(await searchGated(db, makeGate({ progress: 87 }), "%%")).toEqual([]);
  });
});
