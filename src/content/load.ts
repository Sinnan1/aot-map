import fs from "node:fs";
import path from "node:path";
import { z } from "zod";
import { ContentSet } from "./schema";

const FILES = {
  lanes: "lanes.json",
  nodes: "nodes.json",
  edges: "edges.json",
  facts: "facts.json",
  knowledge_states: "knowledge_states.json",
  goals: "goals.json",
  terms: "terms.json",
  aliases: "aliases.json",
} as const;

/** Reads a content directory (one JSON file per table), validates it, and returns a typed ContentSet. */
export function loadContent(dir: string): ContentSet {
  const raw: Record<string, unknown> = {};
  for (const [key, file] of Object.entries(FILES)) {
    const p = path.join(dir, file);
    raw[key] = fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, "utf8")) : [];
  }
  const parsed = ContentSet.safeParse(raw);
  if (!parsed.success) throw new Error(`Content in ${dir} failed schema validation:\n${z.prettifyError(parsed.error)}`);
  return parsed.data;
}
