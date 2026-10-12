import { describe, expect, it } from "vitest";
import { lintContent } from "@/content/lint";
import type { CharacterNodeC, ContentSet } from "@/content/schema";
import { loadGatedGraph, searchGated, searchGatedAliases } from "@/gate/queries";
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
    expect(char(c, "char_historia").title).toBe("Historia Reiss");
    expect(char(c, "char_historia").bio).toContain("Krista persona"); // the merged row's copy is kept
    const krista = c.aliases.filter((a) => a.alias === "Krista Lenz");
    expect(krista.map((a) => a.node_id)).toEqual(["char_historia"]);
    expect(ids(c)).not.toContain("char_krista_lenz"); // never a second bubble
  });

  it("aliases live in aliases.json, gated independently of their node", () => {
    const c = sample();
    const charAliases = c.aliases.filter((a) => a.node_id.startsWith("char_"));
    expect(charAliases).toHaveLength(42);
    expect(new Set(charAliases.map((a) => a.node_id))).toHaveProperty("size", 19);
    // The names moved out of nodes.json entirely.
    expect(JSON.stringify(c.nodes)).not.toContain('"aliases"');
  });

  it("importance is the character prominence scale, not the event tier", () => {
    const c = sample();
    expect(char(c, "char_eren").importance).toBe("core");
    expect(char(c, "char_sasha").importance).toBe("major");
    // tier belongs to events alone: placeEvents() filters to type === "event", so characters never
    // enter the Rule of 7 pool and cannot cannibalise a plot beat's canvas slot.
    const eren = c.nodes.find((n) => n.id === "char_eren") as Record<string, unknown>;
    expect(eren).not.toHaveProperty("tier");
    expect(chars(c).every((n) => !("tier" in n))).toBe(true);
  });

  it("carries the batch 3A reference columns", () => {
    const c = sample();
    const e = char(c, "char_eren");
    expect(e.bio).toContain("Rumbling");
    expect(e.tags).toContain("yeagerists");
    expect(e.icon).toBe("attack_titan");
    expect(e.color).toBe("#2e5a27");
    expect(e.source_url).toContain("attackontitan.fandom.com");
    // Eren's Titan titles are aliases now, and both are gated far later than his node (ep 1).
    const ep1 = c.aliases.filter((a) => a.node_id === "char_eren").map((a) => [a.alias, a.from_ep]);
    expect(ep1).toEqual(expect.arrayContaining([["Attack Titan", 25], ["Founding Titan", 80]]));
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
      const g = await loadGatedGraph(db, makeGate({ progress }));
      const json = JSON.stringify(g);
      const erenJson = JSON.stringify(g.nodes.find((n) => n.id === "char_eren"));
      // Eren is visible from ep 1, so his own row must not smuggle the rest of the plot.
      for (const leak of ["bio", "tags", "aliases", "Yeagerists", "#2e5a27"]) {
        expect(json, `progress ${progress} leaked ${leak}`).not.toContain(leak);
      }
      for (const erenLeak of ["Founding Titan", "Attack Titan", "Rumbling"]) {
        expect(erenJson, `progress ${progress} char_eren leaked ${erenLeak}`).not.toContain(erenLeak);
      }
      if (progress < 43) {
        expect(json, `progress ${progress} leaked Founding Titan`).not.toContain("Founding Titan");
        expect(json, `progress ${progress} leaked Attack Titan`).not.toContain("Attack Titan");
      }
      if (progress < 69) {
        expect(json, `progress ${progress} leaked Rumbling`).not.toContain("Rumbling");
      }
    }
  });

  it("alias search is gated twice, and returns ids rather than alias text", async () => {
    const db = await makeDb(sample());
    const idsOf = async (q: string, progress: number) => (await searchGatedAliases(db, makeGate({ progress }), q)).map((h) => h.id);
    const hit = idsOf;

    // Eren's node is visible from ep 1, but "Founding Titan" is only safe from 80.
    expect(await hit("Founding Titan", 1)).toEqual([]);
    expect(await hit("Founding Titan", 79)).toEqual([]);
    expect(await hit("Founding Titan", 80)).toEqual(["char_eren"]);

    // "Attack Titan" (25) is earlier than "Founding Titan" (80) on the same node.
    expect(await hit("Attack Titan", 24)).toEqual([]);
    expect(await hit("Attack Titan", 25)).toEqual(["char_eren"]);

    // One name, three holders on three timelines. Falco's Jaw Titan is not safe until 78.
    expect(await hit("Jaw Titan", 31)).toEqual(["char_ymir"]);
    expect((await hit("Jaw Titan", 78)).sort()).toEqual(["char_falco", "char_porco", "char_ymir"]);

    // Krista Lenz belongs to Historia, whose node is gated at 30.
    expect(await hit("Krista", 29)).toEqual([]);
    expect(await hit("Krista", 30)).toEqual(["char_historia"]);

    // Hits never carry the matched text back to the client.
    expect(JSON.stringify(await searchGatedAliases(db, makeGate({ progress: 89 }), "Founding Titan"))).not.toContain("Founding Titan");
  });

  it("alias search does not leak a node that the gate removed", async () => {
    const db = await makeDb(sample());
    const hit = async (q: string, progress: number) => (await searchGatedAliases(db, makeGate({ progress }), q)).map((h) => h.id);
    // Zeke is gated at 74; at 20 even a matching alias must return nothing.
    expect(await hit("Beast Titan", 20)).toEqual([]);
    expect(await hit("Beast Titan", 74)).toEqual(["char_zeke"]);
  });

  it("searchGated includes alias matches without duplicating a node", async () => {
    const db = await makeDb(sample());
    const hits = await searchGated(db, makeGate({ progress: 89 }), "Eren");
    // "Eren" matches both char_eren (title) and char_eren (alias "Eren Jaeger"): one row.
    expect(hits.filter((h) => h.id === "char_eren")).toHaveLength(1);
    // A pure-alias query still finds the node.
    expect((await searchGated(db, makeGate({ progress: 89 }), "Mikasa Ackermann")).map((h) => h.id)).toContain("char_mikasa");
  });

  it("rewatch mode reaches every alias", async () => {
    const db = await makeDb(sample());
    expect((await searchGatedAliases(db, makeGate({ rewatch: true }), "Warchief")).map((h) => h.id)).toEqual(["char_zeke"]);
  });

  it("rewatch mode reaches all 19 characters", async () => {
    const db = await makeDb(sample());
    const g = await loadGatedGraph(db, makeGate({ rewatch: true }));
    expect(g.nodes.filter((n) => n.type === "character")).toHaveLength(19);
  });
});