"use client";
import dynamic from "next/dynamic";
import { useEffect, useRef, useState } from "react";
import type { CNode } from "@/gate/types";

/**
 * The only 3D in the product (spec section 6). Not built yet; this is the seam.
 * - 3D bundle is lazy: it downloads only when someone opens the Paths.
 * - Falls back to the 2D layered parallax view when WebGL2 is missing, the device wants to save power,
 *   or the frame rate stays under ~30 fps.
 */
const Paths3D = dynamic(() => import("./PathsVoid3D"), { ssr: false, loading: () => <p className="muted">Loading the Paths…</p> });

export function canUse3D(): boolean {
  try {
    if (!document.createElement("canvas").getContext("webgl2")) return false;
  } catch {
    return false;
  }
  const nav = navigator as Navigator & { connection?: { saveData?: boolean }; deviceMemory?: number };
  if (nav.connection?.saveData) return false;
  if (nav.deviceMemory !== undefined && nav.deviceMemory <= 2) return false;
  return true;
}

/** Calls onLow if the average frame rate stays under `min` for two consecutive 2-second windows. */
export function useFpsGuard(active: boolean, onLow: () => void, min = 30) {
  const cb = useRef(onLow);
  cb.current = onLow;
  useEffect(() => {
    if (!active) return;
    let raf = 0, frames = 0, strikes = 0, windowStart = performance.now();
    const loop = (now: number) => {
      frames++;
      if (now - windowStart >= 2000) {
        strikes = (frames * 1000) / (now - windowStart) < min ? strikes + 1 : 0;
        if (strikes >= 2) return cb.current();
        frames = 0;
        windowStart = now;
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [active, min]);
}

export function PathsVoid({ nodes }: { nodes: CNode[] }) {
  const [mode, setMode] = useState<"checking" | "3d" | "2d">("checking");
  useEffect(() => setMode(canUse3D() ? "3d" : "2d"), []);
  useFpsGuard(mode === "3d", () => setMode("2d"));

  if (mode === "checking") return null;
  return mode === "3d" ? <Paths3D nodes={nodes} /> : <PathsFallback2D nodes={nodes} />;
}

/** Pre-rendered layered parallax stand-in. Replace with authored art when the Paths content exists. */
function PathsFallback2D({ nodes }: { nodes: CNode[] }) {
  return (
    <div className="paths-2d" role="group" aria-label="The Paths, flat view">
      <div className="paths-layer l1" />
      <div className="paths-layer l2" />
      <ul>
        {nodes.map((n) => (
          <li key={n.id}>{n.title}</li>
        ))}
      </ul>
    </div>
  );
}
