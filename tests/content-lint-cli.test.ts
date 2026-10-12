import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * The lint CLI is the researcher's acceptance gate, so its exit codes are load-bearing.
 * `npm run content:lint -- --strict` silently passes because npm swallows the flag; these tests
 * exist so that trap cannot come back unnoticed.
 */
const script = path.join(process.cwd(), "scripts/content-lint.ts");
// Invoke tsx's JS entry with the current node binary. Spawning node_modules/.bin/tsx.cmd fails under
// vitest's worker (a Windows .cmd shim needs a shell), which is why this uses process.execPath.
const tsx = path.join(process.cwd(), "node_modules", "tsx", "dist", "cli.mjs");

/** A minimal content dir. Only the named fault is present. */
function fixture(stale: boolean): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "aot-lint-"));
  const write = (name: string, value: unknown) => fs.writeFileSync(path.join(dir, name), JSON.stringify(value, null, 2));

  write("lanes.json", [{ id: "lore_history", label: "Lore / History", sort: 0, watch_ep: 1 }]);
  const evt = (id: string, watch_ep: number, title: string, because: string | null = null) => ({
    id, type: "event", title, faction_lane: "lore_history", watch_ep, story_order: null, is_flashback: false,
    happened_in: null, confidence: "shown", depth_layer: "surface", tier: 2, summary: `Summary for ${title}.`,
    because, setup_ref: null, void_pos: null, participants: [],
  });
  // evt_second has no `because`: BECAUSE_UNBACKED forces a causes edge to land at or before the node's
  // own watch_ep, and a single edge can be both that and stale. So the clean STALE_EDGE case needs none.
  write("nodes.json", [evt("evt_first", 1, "First"), evt("evt_second", 13, "Second")]);
  write("edges.json", [
    { id: "edge_first_to_second", from: "evt_first", to: "evt_second", type: "causes",
      watch_ep: stale ? 24 : 13, confidence: "shown", why_text: "The first event causes the second." },
  ]);
  for (const f of ["knowledge_states", "goals", "terms", "aliases", "facts"]) write(`${f}.json`, []);
  return dir;
}

function run(dir: string, strict: boolean): { code: number; out: string } {
  try {
    const out = execFileSync(process.execPath, [tsx, script, dir, ...(strict ? ["--strict"] : [])], { encoding: "utf8" });
    return { code: 0, out };
  } catch (e) {
    const err = e as { status: number; stdout: string; stderr: string };
    return { code: err.status, out: (err.stdout ?? "") + (err.stderr ?? "") };
  }
}

describe("content-lint exit codes", () => {
  it("passes a clean directory, with and without strict", () => {
    const dir = fixture(false);
    expect(run(dir, false).code).toBe(0);
    expect(run(dir, true).code).toBe(0);
  });

  it("a warning exits 0 without strict and 1 with it", () => {
    const dir = fixture(true);
    const plain = run(dir, false);
    expect(plain.out).toContain("STALE_EDGE");
    expect(plain.code).toBe(0);

    const strict = run(dir, true);
    expect(strict.code).toBe(1);
    expect(strict.out).toContain("strict: failing on");
  });

  it("reports the warning count, not a count that lumps warnings in as errors", () => {
    const dir = fixture(true);
    expect(run(dir, false).out).toContain("0 errors, 1 warnings");
  });

  it("an error fails both modes", () => {
    const dir = fixture(false);
    fs.writeFileSync(
      path.join(dir, "nodes.json"),
      JSON.stringify([{ id: "evt_broken", type: "event", title: "Broken", faction_lane: "no_such_lane",
        watch_ep: 5, story_order: null, is_flashback: false, happened_in: null, confidence: "shown",
        depth_layer: "surface", tier: 1, summary: "Broken.", because: null, setup_ref: null,
        void_pos: null, participants: [] }], null, 2),
    );
    expect(run(dir, false).code).toBe(1);
    expect(run(dir, true).code).toBe(1);
  });
});