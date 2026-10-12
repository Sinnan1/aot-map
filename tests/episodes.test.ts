import { describe, expect, it } from "vitest";
import { FINALE_EP, SEASONS } from "@/config";
import { parseCsv, parseCsvRecords } from "@/content/csv";
import { lintEpisodes, lintGateCoverage, loadEpisodesCsv, parseEpisodesCsv } from "@/content/episodes";
import type { EpisodeC } from "@/content/schema";
import { loadGatedEpisodes } from "@/gate/queries";
import { makeGate } from "@/gate/gate";
import type { DB } from "@/db/types";
import * as t from "@/db/schema";
import { seedEpisodes } from "@/db/seed-episodes";
import { makeDb, sample } from "./helpers";

const csv = () => loadEpisodesCsv().episodes;
const errors = (e: EpisodeC[]) => lintEpisodes(e).filter((i) => i.severity === "error").map((i) => i.code);

describe("csv reader", () => {
  it("keeps commas inside quoted fields and unescapes doubled quotes", () => {
    expect(parseCsv('a,"b, c","d""e"')).toEqual([["a", "b, c", 'd"e']]);
  });

  it("handles CRLF, a trailing newline, and a trailing empty field", () => {
    expect(parseCsvRecords("a,b\r\n1,2\r\n3,4,\n")).toEqual([
      ["a", "b"],
      ["1", "2"],
      ["3", "4", ""],
    ]);
  });

  it("strips a BOM and drops blank records", () => {
    expect(parseCsvRecords("\uFEFFa,b\n\n1,2\n")).toEqual([["a", "b"], ["1", "2"]]);
  });

  it("throws instead of guessing on an unterminated quote", () => {
    expect(() => parseCsv('a,"b')).toThrow(/unterminated/);
  });
});

describe("episodes csv", () => {
  it("loads 89 episodes, contiguous from 1", () => {
    const eps = csv();
    expect(eps).toHaveLength(89);
    expect(eps.map((e) => e.episode_abs)).toEqual(Array.from({ length: 89 }, (_, i) => i + 1));
  });

  it("passes its own lint", () => {
    expect(errors(csv())).toEqual([]);
  });

  it("skips the header repeated by a concatenated block instead of parsing NaN", () => {
    // The source list was pasted as five blocks that each repeat the header line.
    const header = "episode_abs,season,part,episode_in_part,title,arc,episode_type,summary,source_url";
    const original = `${header}\n${header}\n1,1,1,1,"To You, in 2000 Years",Fall,premiere,"Breach.",\n${header}\n2,1,1,2,"That Day",Fall,normal,"Gate.",\n`;
    const { episodes, skippedHeaders } = parseEpisodesCsv(original);
    expect(episodes).toHaveLength(2);
    expect(skippedHeaders).toBe(2);
    expect(episodes[0]?.episode_abs).toBe(1);
  });

  it("reads the special-part nulling correctly", () => {
    const eps = csv();
    expect(eps.filter((e) => e.part === null).map((e) => e.episode_abs)).toEqual([26, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 37, 88, 89]);
    expect(eps.find((e) => e.episode_abs === 89)).toMatchObject({ episode_type: "finale", season: 4, part: null, episode_in_part: 2 });
  });

  it("turns every empty optional cell into null, never an empty string", () => {
    for (const e of csv()) {
      expect(e.part === null || Number.isInteger(e.part)).toBe(true);
      expect(e.source_url).toBeNull();
    }
  });

  it("rejects a bad header, a non-numeric episode_abs, and a wrong field count", () => {
    expect(() => parseEpisodesCsv("wrong,header\n1,2\n")).toThrow(/header must be/);
    const ok = "episode_abs,season,part,episode_in_part,title,arc,episode_type,summary,source_url";
    expect(() => parseEpisodesCsv(`${ok}\n1,1,1,x,T,A,normal,s,`)).toThrow(/must be a positive integer/);
    expect(() => parseEpisodesCsv(`${ok}\n1,1,1,1,T,A,normal`)).toThrow(/expected 9 fields/);
  });
});

describe("episodes lint", () => {
  const one = (over: Partial<EpisodeC> = {}): EpisodeC => ({
    episode_abs: 1, season: 1, part: 1, episode_in_part: 1, title: "T", arc: "A",
    episode_type: "premiere", summary: null, source_url: null, ...over,
  });

  it("flags a gap and a duplicate in episode_abs", () => {
    expect(errors([one(), one({ episode_abs: 3, episode_type: "normal", episode_in_part: 2 })])).toContain("EPISODE_GAP");
    expect(errors([one(), one({ episode_in_part: 2, episode_type: "normal" })])).toContain("DUPLICATE_EPISODE");
  });

  it("requires exactly one premiere per season, on its first episode", () => {
    expect(errors([one({ episode_type: "normal" })])).toContain("NO_PREMIERE");
    // Premiere marked on ep 3 while the season opens at ep 1.
    expect(errors([one({ episode_type: "normal" }), one({ episode_abs: 2, episode_in_part: 2, episode_type: "normal" }), one({ episode_abs: 3, episode_in_part: 3, episode_type: "premiere" })])).toContain("PREMIERE_PLACEMENT");
    // Two premieres in one season.
    expect(errors([one(), one({ episode_abs: 2, episode_in_part: 2, episode_type: "premiere" })])).toContain("EXTRA_PREMIERE");
  });

  it("requires a finale to close its arc", () => {
    // Finale marked at ep 2, but arc "A" continues to ep 3.
    const eps = [one(), one({ episode_abs: 2, episode_in_part: 2, episode_type: "finale" }), one({ episode_abs: 3, episode_in_part: 3, episode_type: "normal" })];
    expect(errors(eps)).toContain("FINALE_NOT_LAST");
    // Same rows, but ep 3 opens a new arc, so the finale closes "A".
    expect(errors(eps.map((e) => (e.episode_abs === 3 ? { ...e, arc: "B" } : e)))).not.toContain("FINALE_NOT_LAST");
  });

  it("requires episode_in_part to count 1..n inside a group and restart per group", () => {
    expect(errors([one(), one({ episode_abs: 2, episode_in_part: 3, episode_type: "normal" })])).toContain("PART_ORDER");
    expect(errors([one(), one({ episode_abs: 2, part: 2, episode_in_part: 1, episode_type: "normal" })])).toEqual([]);
  });

  it("requires partless episodes to trail a parted season, and parts to run 1..n", () => {
    // Partless first, parted second: the S1 shape of the Final Chapters is reversed.
    const interleaved = [one({ part: null }), one({ episode_abs: 2, episode_in_part: 2, episode_type: "normal" })];
    expect(errors(interleaved)).toContain("MIXED_PARTS");
    // S4 shape: parted 1-2, then partless specials/finale.
    const trailing = [
      one(), one({ episode_abs: 2, episode_in_part: 2, episode_type: "normal" }),
      one({ episode_abs: 3, part: null, episode_in_part: 1, episode_type: "special" }),
      one({ episode_abs: 4, part: null, episode_in_part: 2, episode_type: "finale" }),
    ];
    expect(errors(trailing)).toEqual([]);
    // Parts that skip a number.
    expect(errors([one({ part: 2 }), one({ episode_abs: 2, part: 3, episode_in_part: 1, episode_type: "normal" })])).toContain("PART_START");
  });

  it("EPISODE_UNCOVERED: a gate coordinate with no episode row", () => {
    const eps = [one()];
    expect(lintGateCoverage(eps, [1, 26]).map((i) => i.code)).toEqual(["EPISODE_UNCOVERED"]);
    expect(lintGateCoverage(eps, [1, 1, 1])).toEqual([]);
  });

  it("the real slice content is fully covered by the spine", () => {
    const c = sample();
    const values = [
      ...c.lanes.map((l) => l.watch_ep),
      ...c.nodes.map((n) => n.watch_ep),
      ...c.edges.map((e) => e.watch_ep),
      ...c.facts.map((f) => f.revealed_ep),
      ...c.knowledge_states.flatMap((k) => [k.from_ep, ...(k.to_ep === null ? [] : [k.to_ep])]),
      ...c.terms.map((t) => t.watch_ep),
    ];
    expect(lintGateCoverage(csv(), values)).toEqual([]);
  });
});

describe("config agrees with the episode spine", () => {
  it("FINALE_EP is the last episode_abs", () => {
    expect(FINALE_EP).toBe(csv().at(-1)?.episode_abs);
  });

  it("SEASONS bounds are the episode_abs span of each season", () => {
    const eps = csv();
    SEASONS.forEach((s, i) => {
      const inSeason = eps.filter((e) => e.season === i + 1);
      expect(inSeason.at(0)?.episode_abs, `${s.label} starts at ep ${s.from}`).toBe(s.from);
      expect(inSeason.at(-1)?.episode_abs, `${s.label} ends at ep ${s.to}`).toBe(s.to);
    });
    expect(SEASONS).toHaveLength(new Set(eps.map((e) => e.season)).size);
  });
});

describe("the gate", () => {
  it("withholds unwatched episodes, including the title", async () => {
    const db = await makeDb(sample());
    await seedEpisodes(db, csv());

    expect(await loadGatedEpisodes(db, makeGate({ progress: 0 }))).toEqual([]);
    expect(await loadGatedEpisodes(db, makeGate({ progress: 1 }))).toHaveLength(1);
    expect(await loadGatedEpisodes(db, makeGate({ progress: 25 }))).toHaveLength(25);

    const at25 = await loadGatedEpisodes(db, makeGate({ progress: 25 }));
    expect(at25.at(-1)).toMatchObject({ episodeAbs: 25, title: expect.stringContaining("Assault on Stohess") });

    // The last episode gives away the ending; it must not be reachable before FINALE_EP.
    const beforeFinale = await loadGatedEpisodes(db, makeGate({ progress: FINALE_EP - 1 }));
    expect(beforeFinale.some((e) => e.episodeAbs === FINALE_EP)).toBe(false);
    expect(beforeFinale.at(-1)?.episodeAbs).toBe(FINALE_EP - 1);

    const all = await loadGatedEpisodes(db, makeGate({ progress: FINALE_EP }));
    expect(all).toHaveLength(89);
  });

  it("rewatch mode sees the whole spine", async () => {
    const db = await makeDb(sample());
    await seedEpisodes(db, csv());
    expect(await loadGatedEpisodes(db, makeGate({ progress: 1, rewatch: true }))).toHaveLength(89);
  });

  it("re-seeding replaces rows instead of keeping the first copy", async () => {
    const db = await makeDb(sample());
    await seedEpisodes(db, csv());
    const fixed = csv().map((e) => (e.episode_abs === 1 ? { ...e, title: "Retitled" } : e));
    await seedEpisodes(db, fixed);

    const rows = await db.select().from(t.episodes);
    expect(rows).toHaveLength(89);
    expect(rows.find((r) => r.episodeAbs === 1)?.title).toBe("Retitled");
  });

  it("an empty spine seeds nothing rather than clearing the table into a broken state", async () => {
    const db = (await makeDb(sample())) as DB;
    expect(await seedEpisodes(db, [])).toBe(0);
    expect(await loadGatedEpisodes(db, makeGate({ progress: 99 }))).toEqual([]);
  });
});