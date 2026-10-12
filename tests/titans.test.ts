import { beforeAll, describe, expect, it } from "vitest";
import { placeEvents } from "@/components/ribbon/layout";
import { hasErrors, lintContent } from "@/content/lint";
import type { ConceptNodeC, ContentSet, LocationNodeC, TitanNodeC } from "@/content/schema";
import type { DB } from "@/db/types";
import { makeGate } from "@/gate/gate";
import { loadGatedGraph, searchGated, searchGatedAliases } from "@/gate/queries";
import { holdersAt } from "@/lib/lenses";
import { makeDb, sample } from "./helpers";

const titans = (c: ContentSet) => c.nodes.filter((n): n is TitanNodeC => n.type === "titan");
const titan = (c: ContentSet, id: string) => titans(c).find((n) => n.id === id) as TitanNodeC;
const concepts = (c: ContentSet) => c.nodes.filter((n): n is ConceptNodeC => n.type === "concept");
const concept = (c: ContentSet, id: string) => concepts(c).find((n) => n.id === id) as ConceptNodeC;
const locations = (c: ContentSet) => c.nodes.filter((n): n is LocationNodeC => n.type === "location");
const location = (c: ContentSet, id: string) => locations(c).find((n) => n.id === id) as LocationNodeC;

describe("titan nodes", () => {
  it("loads all 11 Titan rows with importance, source_url, and without tier or lane_history", () => {
    const c = sample();
    const ts = titans(c);
    expect(ts).toHaveLength(11);
    for (const id of [
      "titan_founding", "titan_attack", "titan_armored", "titan_colossal", "titan_female",
      "titan_beast", "titan_jaw", "titan_cart", "titan_war_hammer", "titan_pure", "titan_wall",
    ]) {
      expect(ts.map((t) => t.id), id).toContain(id);
    }
    expect(titan(c, "titan_founding").importance).toBe("core");
    expect(titan(c, "titan_armored").importance).toBe("major");
    expect(titan(c, "titan_war_hammer").importance).toBe("major");
    expect(ts.every((n) => n.source_url?.startsWith("https://attackontitan.fandom.com/wiki/"))).toBe(true);
    expect(ts.every((n) => !("tier" in n) && !("lane_history" in n))).toBe(true);
  });

  it("gates each Titan at the episode its name is spoken, not its first on-screen sighting", () => {
    const c = sample();
    expect(titan(c, "titan_colossal").watch_ep).toBe(1);
    expect(titan(c, "titan_armored").watch_ep).toBe(2);
    expect(titan(c, "titan_female").watch_ep).toBe(17);
    expect(titan(c, "titan_wall").watch_ep).toBe(25);
    expect(titan(c, "titan_beast").watch_ep).toBe(26);
    // Delayed past first_appears_ep until the show actually names the Titan:
    expect(titan(c, "titan_founding").watch_ep).toBe(43); // CSV 37 ("Coordinate" only) -> 43 ("Sin")
    expect(titan(c, "titan_pure").watch_ep).toBe(57); // CSV 1 -> 57 ("That Day")
    expect(titan(c, "titan_attack").watch_ep).toBe(58); // CSV 7 -> 58 ("Attack Titan")
    expect(titan(c, "titan_jaw").watch_ep).toBe(60); // CSV 29 -> 60 (Marley premiere)
    expect(titan(c, "titan_cart").watch_ep).toBe(60); // CSV 50 -> 60 (Marley premiere)
    expect(titan(c, "titan_war_hammer").watch_ep).toBe(65);
  });

  it("rewrites spoiler-heavy short_descriptions while keeping bio and tags server-only", () => {
    const c = sample();
    // Summaries are sent to the client at watch_ep, so they must not name later reveals.
    expect(titan(c, "titan_founding").summary).not.toMatch(/eldian/i);
    expect(titan(c, "titan_attack").summary).not.toMatch(/future memories/i);
    expect(titan(c, "titan_wall").summary).not.toMatch(/paradis|millions/i);

    // Server-only bio and tags preserve the full CSV reference copy.
    expect(titan(c, "titan_founding").bio).toContain("Rumbling");
    expect(titan(c, "titan_attack").bio).toContain("future inheritors");
    expect(titan(c, "titan_wall").tags).toContain("karl_fritz");
  });

  it("gates Titan aliases independently of their Titan node", () => {
    const c = sample();
    const titanAliases = c.aliases.filter((a) => a.node_id.startsWith("titan_"));
    expect(titanAliases).toHaveLength(26);

    // Founding Titan is visible at ep 43, but "Progenitor Titan" is Marley/Kruger framing (ep 58).
    const founding = titanAliases.filter((a) => a.node_id === "titan_founding").map((a) => [a.alias, a.from_ep]);
    expect(founding).toEqual([["Founder", 43], ["The Coordinate", 43], ["Progenitor Titan", 58]]);

    // Colossal Titan is visible at ep 1, but "God of Destruction" is Marley-arc framing (ep 62).
    const colossal = titanAliases.filter((a) => a.node_id === "titan_colossal").map((a) => [a.alias, a.from_ep]);
    expect(colossal).toEqual([["Colossus Titan", 1], ["God of Destruction", 62]]);
  });

  it("lints clean and flags spoiler copy in Titan summaries", () => {
    const c = structuredClone(sample());
    expect(hasErrors(lintContent(c))).toBe(false);

    // Mentioning a late term in an early Titan summary triggers SPOILER_COPY.
    titan(c, "titan_colossal").summary = "A massive Titan sent by Marley Military to breach the gate.";
    expect(lintContent(c).map((i) => i.code)).toContain("SPOILER_COPY");
  });
});

describe("concept nodes", () => {
  it("loads all 12 Concept rows with importance and without tier or lane_history", () => {
    const c = sample();
    const cs = concepts(c);
    expect(cs).toHaveLength(12);
    for (const id of [
      "concept_the_paths", "concept_subjects_of_ymir", "concept_royal_blood", "concept_vow_renouncing_war",
      "concept_the_rumbling", "concept_coordinate", "concept_titan_inheritance", "concept_memory_manipulation",
      "concept_eldian_internment", "concept_great_titan_war", "concept_paradise_island_isolation", "concept_warrior_program",
    ]) {
      expect(cs.map((n) => n.id), id).toContain(id);
    }
    expect(concept(c, "concept_the_paths").importance).toBe("core");
    expect(concept(c, "concept_great_titan_war").importance).toBe("major");
    expect(cs.every((n) => !("tier" in n) && !("lane_history" in n))).toBe(true);
  });

  it("rewrites pre-Basement concept summaries so they do not leak Paths, Founding Titan, or Karl Fritz early", () => {
    const c = sample();
    expect(concept(c, "concept_coordinate").watch_ep).toBe(37);
    expect(concept(c, "concept_coordinate").summary).not.toMatch(/paths|founding titan/i);
    expect(concept(c, "concept_memory_manipulation").watch_ep).toBe(42);
    expect(concept(c, "concept_memory_manipulation").summary).not.toMatch(/founding titan|subjects of ymir/i);
    expect(concept(c, "concept_titan_inheritance").watch_ep).toBe(43);
    expect(concept(c, "concept_titan_inheritance").summary).not.toMatch(/nine titan|mindless titan/i);
    expect(concept(c, "concept_royal_blood").watch_ep).toBe(44);
    expect(concept(c, "concept_royal_blood").summary).not.toMatch(/ymir fritz/i);
    expect(concept(c, "concept_vow_renouncing_war").watch_ep).toBe(44);
    expect(concept(c, "concept_vow_renouncing_war").summary).not.toMatch(/karl fritz/i);
    expect(concept(c, "concept_the_rumbling").watch_ep).toBe(69);

    const conceptAliases = c.aliases.filter((a) => a.node_id.startsWith("concept_"));
    expect(conceptAliases).toHaveLength(33);
  });
});

describe("location nodes", () => {
  it("loads all 13 Location rows with importance, source_url, and without tier or lane_history", () => {
    const c = sample();
    const ls = locations(c);
    expect(ls).toHaveLength(13);
    for (const id of [
      "location_shiganshina", "location_trost_district", "location_wall_maria", "location_wall_rose",
      "location_wall_sheena", "location_mitras", "location_stohess_district", "location_marley",
      "location_liberio", "location_paradis_island", "location_reiss_chapel", "location_ragako_village",
      "location_fort_salta",
    ]) {
      expect(ls.map((n) => n.id), id).toContain(id);
    }
    expect(location(c, "location_shiganshina").importance).toBe("core");
    expect(location(c, "location_ragako_village").importance).toBe("minor");
    expect(ls.every((n) => n.source_url?.startsWith("https://attackontitan.fandom.com/wiki/"))).toBe(true);
    expect(ls.every((n) => !("tier" in n) && !("lane_history" in n))).toBe(true);
  });

  it("rewrites early location summaries so they do not leak Paradis Island, Ragako's fate, or Titan succession", () => {
    const c = sample();
    expect(location(c, "location_wall_maria").watch_ep).toBe(1);
    expect(location(c, "location_wall_maria").summary).not.toMatch(/paradis/i);
    expect(location(c, "location_trost_district").watch_ep).toBe(2);
    expect(location(c, "location_trost_district").summary).not.toMatch(/first victory/i);
    expect(location(c, "location_ragako_village").watch_ep).toBe(27);
    expect(location(c, "location_ragako_village").summary).not.toMatch(/beast titan|turned into titans/i);
    expect(location(c, "location_reiss_chapel").watch_ep).toBe(40);
    expect(location(c, "location_reiss_chapel").summary).not.toMatch(/titan succession/i);

    const locAliases = c.aliases.filter((a) => a.node_id.startsWith("location_"));
    expect(locAliases).toHaveLength(31);
  });
});

describe("the gate and search seal Titan, Concept, and Location nodes and aliases", () => {
  let db: DB;
  beforeAll(async () => {
    db = await makeDb(sample());
  });

  it("never places Titan, Concept, or Location nodes on the event canvas or in character holders", async () => {
    const g = await loadGatedGraph(db, makeGate({ rewatch: true }));
    const placed = placeEvents(g.nodes, g.lanes.map((l) => l.id), 1);
    expect(placed.some((p) => p.node.type !== "event")).toBe(false);
    expect(holdersAt(g, 89).some((h) => !h.id.startsWith("char_"))).toBe(false);
  });

  it("separates knowing a Titan, Concept, or Location exists from later reveals", async () => {
    // At ep 10, searching "Armored Titan" finds the Titan node (ep 2), never Reiner (unmasked at 31).
    const at10 = await searchGated(db, makeGate({ progress: 10 }), "Armored Titan");
    expect(at10.map((h) => h.id)).toEqual(["titan_armored"]);

    // At ep 31, both the Titan node and Reiner (via alias) are reachable.
    const at31 = await searchGated(db, makeGate({ progress: 31 }), "Armored Titan");
    expect(at31.map((h) => h.id)).toEqual(expect.arrayContaining(["titan_armored", "char_reiner"]));

    // At ep 37, "Coordinate" finds concept_coordinate, without leaking titan_founding (ep 43).
    const coord37 = await searchGated(db, makeGate({ progress: 37 }), "Coordinate");
    expect(coord37.map((h) => h.id)).toEqual(["concept_coordinate"]);
    const coord43 = await searchGated(db, makeGate({ progress: 43 }), "Coordinate");
    expect(coord43.map((h) => h.id)).toEqual(expect.arrayContaining(["concept_coordinate", "titan_founding"]));

    // At ep 20, Wall Sheena is visible via alias "Wall Sina", while Marley and Paradis Island (ep 57) are withheld.
    const sina20 = await searchGated(db, makeGate({ progress: 20 }), "Wall Sina");
    expect(sina20.map((h) => h.id)).toEqual(["location_wall_sheena"]);
    expect(await searchGated(db, makeGate({ progress: 20 }), "Paradis Island")).toEqual([]);
    expect((await searchGated(db, makeGate({ progress: 57 }), "Paradis Island")).map((h) => h.id)).toContain("location_paradis_island");
  });

  it("withholds late Titan, Concept, and Location aliases until their own from_ep", async () => {
    const aliasIds = async (q: string, progress: number) =>
      (await searchGatedAliases(db, makeGate({ progress }), q)).map((h) => h.id);

    expect(await aliasIds("Progenitor Titan", 43)).toEqual([]);
    expect(await aliasIds("Progenitor Titan", 57)).toEqual([]);
    expect(await aliasIds("Progenitor Titan", 58)).toEqual(["titan_founding"]);

    expect(await aliasIds("God of Destruction", 1)).toEqual([]);
    expect(await aliasIds("God of Destruction", 61)).toEqual([]);
    expect(await aliasIds("God of Destruction", 62)).toEqual(["titan_colossal"]);

    expect(await aliasIds("Intersection of Paths", 37)).toEqual([]);
    expect(await aliasIds("Intersection of Paths", 58)).toEqual(["concept_coordinate"]);

    expect(await aliasIds("Fritz Bloodline", 44)).toEqual([]);
    expect(await aliasIds("Fritz Bloodline", 57)).toEqual(["concept_royal_blood"]);

    expect(await aliasIds("Path Realm", 58)).toEqual([]);
    expect(await aliasIds("Path Realm", 78)).toEqual(["concept_the_paths"]);

    expect(await aliasIds("Crystal Cavern", 40)).toEqual([]);
    expect(await aliasIds("Crystal Cavern", 42)).toEqual(["location_reiss_chapel"]);
  });

  it("never leaks Titan, Concept, or Location bio, tags, or future memory spoilers to the client", async () => {
    for (const progress of [1, 25, 43, 58, 65, 89]) {
      const json = JSON.stringify(await loadGatedGraph(db, makeGate({ progress })));
      for (const leak of ["future inheritors", "karl_fritz", "nine_titans", "curse_of_ymir", "iceburst_stone", "aerosolized spinal fluid", "#8E44AD", "#00e5ff"]) {
        expect(json, `progress ${progress} leaked ${leak}`).not.toContain(leak);
      }
    }
  });
});
