"use client";
import type { CNode } from "@/gate/types";

/**
 * TODO(step 4 of the build plan): React Three Fiber scene.
 *   npm i three @react-three/fiber @react-three/drei
 *   - Constrained OrbitControls with a reset button; time runs on Y; memories as arcs flowing down.
 *   - Place each node at node.voidPos; tapping a shard opens the normal 2D detail card (dispatch select_node).
 *   - Honour prefers-reduced-motion by replacing camera glides with cuts.
 * Keep three out of every other bundle: this file is only ever imported through next/dynamic.
 */
export default function PathsVoid3D({ nodes }: { nodes: CNode[] }) {
  return (
    <div className="paths-2d" role="group" aria-label="The Paths (3D placeholder)">
      <p className="muted">3D scene goes here ({nodes.length} shard{nodes.length === 1 ? "" : "s"}).</p>
    </div>
  );
}
