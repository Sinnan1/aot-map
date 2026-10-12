import { FINALE_EP } from "@/config";
import type { Confidence } from "@/content/enums";

/**
 * The viewer's spoiler gate. This is a spoiler guard, not a security boundary:
 * the cookie is user-editable, which is fine because the user is the only one it protects.
 */
export interface Gate {
  progress: number; // highest episode watched; 0 = new to the show
  theories: boolean; // show interpretation-level items
  rewatch: boolean; // omniscient mode (progress is forced to FINALE_EP)
}

export const clampProgress = (n: number) => (Number.isFinite(n) ? Math.min(Math.max(Math.trunc(n), 0), FINALE_EP) : 0);

export function makeGate(input: Partial<Gate>): Gate {
  const rewatch = !!input.rewatch;
  return { progress: rewatch ? FINALE_EP : clampProgress(input.progress ?? 0), theories: !!input.theories, rewatch };
}

/** Cookie format: "<progress>.<theories 0|1>.<rewatch 0|1>", e.g. "64.0.0". */
export function serializeGate(g: Gate): string {
  return `${g.progress}.${g.theories ? 1 : 0}.${g.rewatch ? 1 : 0}`;
}

export function parseGate(value: string | null | undefined): Gate | null {
  if (!value) return null;
  const m = /^(\d{1,3})\.([01])\.([01])$/.exec(value);
  if (!m) return null;
  return makeGate({ progress: Number(m[1]), theories: m[2] === "1", rewatch: m[3] === "1" });
}

export const allowedConfidence = (g: Gate): Confidence[] =>
  g.theories ? ["shown", "implied", "interpretation"] : ["shown", "implied"];
