import { describe, expect, it } from "vitest";
import { lintContent } from "@/content/lint";
import type { CharacterNodeC, ContentSet } from "@/content/schema";
import { loadGatedGraph } from "@/gate/queries";
import { makeGate } from "@/gate/gate";
import { makeDb, sample } from "./helpers";

const chars = (c: ContentSet) => c.nodes.filter((n): n is CharacterNodeC => n.type === "character");
const char = (c: ContentSet, id: string) => chars(c).find((n) => n.id === id) as CharacterNodeC;
const ids = (c: ContentSet) => c.nodes.map((n) => n.id);

describe("character nodes", () => {
  it("the batch 3A characters are loaded, one node per person", () => {
    const c = sample();
    const cs = chars(c);
    expect(cs).toHaveLength(19); // 20 CSV rows, krista_lenz merged into historia
    for (const id of [
      "char_eren", "char_mikasa", "char_armin", "char_reiner", "char_bertholdt", "char_annie",
      "char_levi", "char_hange", "char_historia", "char_grisha", "char_zeke", "char_ymir",
      "char_jean", "char_connie", "char_sasha", "char_falco", "char_gabi", "char_pieck", "char_porco",
    ]) {
      expect(ids(c), id).toContain(id);
    }
    expect(ids(c)).not.toContain("char_krista_lenz"); // never a second bubble
  });

  it("Krista Lenz survives as an alias of Historia, not as a node", () => {
    const c = sample();
    const h = char(c, "char_historia");
    expect(h.title).toBe("Historia Reiss");
    expect(h.aliases).toEqual(expect.arrayContaining(["Krista Lenz", "Christa Lenz", "Queen Historia"]));
    expect(h.bio).toContain("Krista persona"); // the merged row's copy is kept
    expect(chars(c).filter((n) => n.aliases.includes("Krista Lenz"))).toHaveLength(1);
  });

  it("importance maps onto the single tier scale", () => {
    const c = sample();
    expect(char(c, "char_eren").tier).toBe(1); // core
    expect(char(c, "char_sasha").tier).toBe(2); // major
  });

  it("carries the batch 3A reference columns", () => {
    const c = sample();
    const e = char(c, "char_eren");
    expect(e.bio).toContain("Rumbling");
    expect(e.tags).toContain("yeagerists");
    expect(e.icon).toBe("attack_titan");
    expect(e.color).toBe("#2e5a27");
    expect(e.source_url).toContain("attackontitan.fandom.com");
    expect(e.aliases).toContain("Founding Titan");
  });

  it("watch_ep is the reveal, never the first sighting on screen", () => {
    const c = sample();
    // The CSV's first_appears_ep for these is 1-3, which would name them long before the show does.
    expect(char(c, "char_historia").watch_ep).toBe(30);
    expect(char(c, "char_zeke").watch_ep).toBe(74);
    expect(char(c, "char_bertholdt").watch_ep).toBe(31);
    expect(char(c, "char_grisha").watch_ep).toBe(48);
    expect(char(c, "char_ymir").watch_ep).toBe(30);
    // Unchanged where the CSV was already safe.
    expect(char(c, "char_eren").watch_ep).toBe(1);
  });

  it("lane history starts at watch_ep and only moves forward", () => {
    for (const n of chars(sample())) {
      expect(n.lane_history[0]?.from_ep, n.id).toBe(n.watch_ep);
      for (let i = 1; i < n.lane_history.length; i++)
        expect(n.lane_history[i]!.from_ep, n.id).toBeGreaterThan(n.lane_history[i - 1]!.from_ep);
    }
    // Reiner moves scouts -> warriors at ep 31, Historia joins the government at ep 40.
    expect(char(sample(), "char_reiner").lane_history).toEqual([
      { from_ep: 17, lane: "scouts" },
      { from_ep: 31, lane: "warriors" },
    ]);
    expect(char(sample(), "char_historia").lane_history.at(-1)).toEqual({ from_ep: 40, lane: "paradis_government" });
  });

  it("still lints clean with 19 characters in the graph", () => {
    expect(lintContent(sample()).filter((i) => i.severity === "error")).toEqual([]);
  });
});

describe("the gate seals the newly added characters", () => {
  it("a viewer at ep 20 sees the cadets, Levi and Hange but nobody named later", async () => {
    const db = await makeDb(sample());
    const g = await loadGatedGraph(db, makeGate({ progress: 20 }));
    const seen = g.nodes.map((n) => n.id);
    expect(seen).toEqual(
      expect.arrayContaining(["char_eren", "char_mikasa", "char_armin", "char_reiner", "char_levi", "char_hange", "char_jean", "char_connie", "char_sasha"]),
    );
    for (const sealed of ["char_annie", "char_historia", "char_bertholdt", "char_grisha", "char_gabi", "char_zeke", "char_pieck", "char_porco"]) {
      expect(seen, sealed).not.toContain(sealed);
    }
    expect(g.nodes.every((n) => n.watchEp <= 20)).toBe(true);
  });

  it("a viewer at ep 33 has Ymir and Historia but not Zeke or Pieck", async () => {
    const db = await makeDb(sample());
    const seen = (await loadGatedGraph(db, makeGate({ progress: 33 }))).nodes.map((n) => n.id);
    expect(seen).toContain("char_historia");
    expect(seen).toContain("char_ymir");
    expect(seen).toContain("char_bertholdt");
    expect(seen).not.toContain("char_zeke");
    expect(seen).not.toContain("char_pieck");
    expect(seen).not.toContain("char_porco");
  });

  it("bio, tags and aliases never reach the client, at any gate", async () => {
    const db = await makeDb(sample());
    for (const progress of [1, 20, 33, 64, 89]) {
      const json = JSON.stringify(await loadGatedGraph(db, makeGate({ progress })));
      // Eren is visible from ep 1, so his own row must not smuggle the rest of the plot.
      for (const leak of ["bio", "tags", "aliases", "Yeagerists", "Founding Titan", "Rumbling", "Attack Titan", "#2e5a27"]) {
        expect(json, `progress ${progress} leaked ${leak}`).not.toContain(leak);
      }
    }
  });

  it("rewatch mode reaches all 19 characters", async () => {
    const db = await makeDb(sample());
    const g = await loadGatedGraph(db, makeGate({ rewatch: true }));
    expect(g.nodes.filter((n) => n.type === "character")).toHaveLength(19);
  });
});