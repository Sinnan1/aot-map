import fs from "node:fs";
import path from "node:path";
import { z } from "zod";
import { parseCsvRecords } from "./csv";
import type { LintIssue, Severity } from "./lint";
import { Episode, type EpisodeC } from "./schema";

const COLUMNS = ["episode_abs", "season", "part", "episode_in_part", "title", "arc", "episode_type", "summary", "source_url"] as const;

/**
 * Parses content/episodes.csv into typed rows.
 *
 * The source list was pasted as five concatenated blocks that each repeat the header line, so
 * a header-shaped record is skipped rather than fed to the number parser. Returns the rows in
 * ascending episode order plus the count of skipped header records, so the caller can report it.
 */
export function parseEpisodesCsv(csv: string): { episodes: EpisodeC[]; skippedHeaders: number } {
  const records = parseCsvRecords(csv);
  if (!records.length) throw new Error("episodes csv is empty");

  const [headerRow = []] = records;
  const header = headerRow.map((c) => c.toLowerCase());
  if (header.length !== COLUMNS.length || COLUMNS.some((c, i) => header[i] !== c))
    throw new Error(`episodes csv header must be exactly: ${COLUMNS.join(",")}\ngot: ${headerRow.join(",")}`);

  const episodes: EpisodeC[] = [];
  let skippedHeaders = 0;

  for (const [i, cells] of records.slice(1).entries()) {
    const line = i + 2; // 1-based, counting the header
    if (cells.length !== COLUMNS.length) throw new Error(`episodes csv line ${line}: expected ${COLUMNS.length} fields, got ${cells.length}`);
    // cells.length is checked above, so this tuple cast is the honest shape.
    const [episodeAbs, season, part, episodeInPart, title, arc, episodeType, summary, sourceUrl] = cells as [
      string, string, string, string, string, string, string, string, string,
    ];
    if (/episode_abs/i.test(episodeAbs)) {
      skippedHeaders++;
      continue; // repeated header from a concatenated block
    }

    const int = (col: string, cell: string) => {
      if (!/^\d+$/.test(cell)) throw new Error(`episodes csv line ${line}: ${col} must be a positive integer, got "${cell}"`);
      return Number(cell);
    };

    const parsed = Episode.safeParse({
      episode_abs: int("episode_abs", episodeAbs),
      season: int("season", season),
      part: part === "" ? null : int("part", part),
      episode_in_part: int("episode_in_part", episodeInPart),
      title,
      arc,
      episode_type: episodeType,
      summary: summary || null, // empty string would defeat "has a summary" checks downstream
      source_url: sourceUrl || null,
    });
    if (!parsed.success) throw new Error(`episodes csv line ${line} failed validation:\n${z.prettifyError(parsed.error)}`);
    episodes.push(parsed.data);
  }

  episodes.sort((a, b) => a.episode_abs - b.episode_abs);
  return { episodes, skippedHeaders };
}

export const loadEpisodesCsv = (file = path.join(process.cwd(), "content/episodes.csv")) => parseEpisodesCsv(fs.readFileSync(/*turbopackIgnore: true*/ file, "utf8"));

const issue = (severity: Severity, code: string, id: string, message: string): LintIssue => ({ severity, code, id, message });

/**
 * Cross-row rules for the episode spine (spec section 7 authoring rules). Pure, runs in CI.
 * 1. episode_abs is the primary key: unique and gapless from 1.
 * 2. Exactly one premiere per season, opening it.
 * 3. A finale closes its arc.
 * 4. episode_in_part counts 1..n inside each (season, part) group and restarts per group.
 * 5. A season is either wholly parted or wholly unparted.
 */
export function lintEpisodes(episodes: EpisodeC[]): LintIssue[] {
  const issues: LintIssue[] = [];
  const at = (e: EpisodeC) => `ep_${e.episode_abs}`;

  // 1. Contiguity from 1
  const seen = new Set<number>();
  for (const e of episodes) {
    if (seen.has(e.episode_abs)) issues.push(issue("error", "DUPLICATE_EPISODE", at(e), `episode_abs ${e.episode_abs} appears more than once`));
    seen.add(e.episode_abs);
  }
  const last = episodes.at(-1)?.episode_abs ?? 0;
  for (let n = 1; n <= last; n++)
    if (!seen.has(n)) issues.push(issue("error", "EPISODE_GAP", `ep_${n}`, `episode_abs ${n} is missing between 1 and ${last}`));

  // 2. One premiere per season, on the season's first episode
  const seasons = new Map<number, EpisodeC[]>();
  for (const e of episodes) seasons.set(e.season, [...(seasons.get(e.season) ?? []), e]);
  for (const [season, list] of seasons) {
    const premieres = list.filter((e) => e.episode_type === "premiere");
    const first = premieres[0];
    const seasonStart = list[0] as EpisodeC; // the map is built from rows, so no season is empty
    if (!first) issues.push(issue("error", "NO_PREMIERE", `season_${season}`, "season has no premiere"));
    else {
      for (const p of premieres.slice(1))
        issues.push(issue("error", "EXTRA_PREMIERE", at(p), `season ${season} already opens at ep ${first.episode_abs}`));
      if (first !== seasonStart)
        issues.push(issue("error", "PREMIERE_PLACEMENT", at(first), `season ${season} opens at ep ${seasonStart.episode_abs}, but the premiere is marked at ep ${first.episode_abs}`));
    }
  }

  // 3. A finale closes its arc.
  const arcEnd = new Map<string, number>();
  for (const e of episodes) arcEnd.set(e.arc, Math.max(arcEnd.get(e.arc) ?? 0, e.episode_abs));
  for (const e of episodes)
    if (e.episode_type === "finale" && arcEnd.get(e.arc) !== e.episode_abs)
      issues.push(issue("error", "FINALE_NOT_LAST", at(e), `arc "${e.arc}" ends at ep ${arcEnd.get(e.arc)}, but the finale is marked at ep ${e.episode_abs}`));

  // 4 + 5. Parts: contiguous 1..n per group, and a season's non-special episodes are all
  //         parted or all unparted. Specials sit outside parts (S4 is parted 60-87, then 88-89
  //         are partless Final Chapters), so they are excluded from this rule.
  const groups = new Map<string, EpisodeC[]>();
  for (const e of episodes) {
    const key = `${e.season}/${e.part ?? "-"}`;
    groups.set(key, [...(groups.get(key) ?? []), e]);
  }
  for (const [key, list] of groups) {
    list.forEach((e, i) => {
      if (e.episode_in_part !== i + 1) issues.push(issue("error", "PART_ORDER", at(e), `expected episode_in_part ${i + 1} in group ${key}, got ${e.episode_in_part}`));
    });
  }
  for (const [season, list] of seasons) {
    // Partless episodes must trail the season: S4 runs parts 1-2 over eps 60-87, then 88-89 sit
    // outside the parts as the Final Chapters. Partless episodes in the middle mean a mis-sorted
    // list, not a different disc structure.
    const partless = list.filter((e) => e.part === null);
    if (partless.length && list.slice(list.length - partless.length).some((e) => e.part !== null))
      issues.push(issue("error", "MIXED_PARTS", `season_${season}`, "partless episodes must come after every parted episode in the season"));

    const parts = [...new Set(list.map((e) => e.part).filter((p): p is number => p !== null))].sort((a, b) => a - b);
    if (parts.some((p, i) => p !== i + 1))
      issues.push(issue("error", "PART_START", `season_${season}`, `part numbers must run 1..n, got ${parts.join(",")}`));
  }

  return issues;
}

/**
 * The spine must cover every gate coordinate in the content, or a node could sit at an
 * episode the UI cannot describe. Reports gate values with no matching episode_abs.
 */
export function lintGateCoverage(episodes: EpisodeC[], gateValues: Iterable<number>): LintIssue[] {
  const known = new Set(episodes.map((e) => e.episode_abs));
  const issues: LintIssue[] = [];
  for (const v of new Set(gateValues))
    if (!known.has(v)) issues.push(issue("error", "EPISODE_UNCOVERED", `ep_${v}`, `content references ep ${v}, which is not in the episode spine`));
  return issues;
}