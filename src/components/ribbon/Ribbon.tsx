"use client";
import { useRef, type Dispatch } from "react";
import { SEASON4_FIRST_EP } from "@/config";
import type { KState } from "@/content/enums";
import type { CEdge, CNode, GatedGraph } from "@/gate/types";
import type { Action, ViewState } from "@/lib/viewState";
import { StateRing } from "./StateGlyph";
import { HEADER_H, LANE_H, ZONE_GAP, ZOOM_FACTOR, episodeToX, xToEpisode, type Cluster, type Placed } from "./layout";

interface Props {
  graph: GatedGraph;
  view: ViewState;
  dispatch: Dispatch<Action>;
  width: number;
  laneIds: string[]; // visible lanes, top to bottom
  primary: Placed[];
  clusters: Cluster[];
  focus: Set<string> | null; // Rule 2: everything outside this fades to 10%
  edges: CEdge[]; // arrows only on request
  charLane: Map<string, string | null>;
  ringFor: (charId: string) => KState | null;
}

const NODE_Y = 40;
const CHAR_Y = 94;
const short = (s: string, n = 17) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

export function Ribbon({ graph, view, dispatch, width, laneIds, primary, clusters, focus, edges, charLane, ringFor }: Props) {
  const zf = ZOOM_FACTOR[view.zoom];
  const cx = episodeToX(view.cursor, view.zoom);
  const tx = width * 0.6 - cx;
  const height = HEADER_H + laneIds.length * LANE_H;
  const laneY = (i: number) => HEADER_H + i * LANE_H;
  const dim = (id: string) => (focus && !focus.has(id) ? 0.1 : 1);

  // Drag to scrub. A drag never counts as a tap on a node.
  const drag = useRef<{ x: number; cursor: number; moved: boolean } | null>(null);
  const onDown = (e: React.PointerEvent) => {
    drag.current = { x: e.clientX, cursor: view.cursor, moved: false };
    (e.currentTarget as Element).setPointerCapture(e.pointerId);
  };
  const onMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    const dx = e.clientX - d.x;
    if (Math.abs(dx) > 6) d.moved = true;
    if (d.moved) dispatch({ type: "cursor", ep: Math.round(xToEpisode(episodeToX(d.cursor, view.zoom) - dx, view.zoom)) });
  };
  const onUp = () => {
    window.setTimeout(() => (drag.current = null), 0);
  };
  const tap = (fn: () => void) => () => {
    if (!drag.current?.moved) fn();
  };

  const pos = new Map<string, { x: number; y: number }>();
  for (const p of primary) pos.set(p.node.id, { x: p.x, y: laneY(p.laneIndex) + NODE_Y });

  // Episode ticks for what's on screen.
  const leftEp = Math.floor(xToEpisode(-tx, view.zoom)) - 1;
  const rightEp = Math.ceil(xToEpisode(-tx + width, view.zoom)) + 1;
  const ticks: number[] = [];
  for (let ep = Math.max(1, leftEp); ep <= Math.min(view.progress, rightEp); ep++) {
    if (ep >= SEASON4_FIRST_EP || ep === 1 || ep % 10 === 0) ticks.push(ep);
  }
  const seamX = episodeToX(SEASON4_FIRST_EP, view.zoom) - (ZONE_GAP / 2) * zf;

  const chars = graph.nodes.filter((n) => n.type === "character" && n.watchEp <= view.cursor);
  const byLane = new Map<string, CNode[]>();
  for (const c of chars) {
    const lane = charLane.get(c.id);
    if (lane && laneIds.includes(lane)) byLane.set(lane, [...(byLane.get(lane) ?? []), c]);
  }

  return (
    <svg className="ribbon" width={width} height={height} role="group" aria-label="Season 4 time ribbon">
      <defs>
        <marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
          <path d="M0 0 L10 5 L0 10 z" className="arrow-head" />
        </marker>
      </defs>

      <rect className="bg" width={width} height={height} onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp} />

      {/* lane bands */}
      {laneIds.map((id, i) => (
        <g key={id} pointerEvents="none">
          <rect x={0} y={laneY(i)} width={width} height={LANE_H} className={`lane-band ${i % 2 ? "alt" : ""}`} />
          <rect x={0} y={laneY(i)} width={4} height={LANE_H} style={{ fill: `var(--lane-${id}, var(--lane-default))` }} />
        </g>
      ))}

      <g style={{ transform: `translate(${tx}px, 0px)` }} className="camera">
        {/* zone labels + episode ticks */}
        <g pointerEvents="none" className="axis">
          <text x={seamX - 10} y={22} textAnchor="end" className="zone-label">Previously</text>
          {view.progress >= SEASON4_FIRST_EP && <text x={seamX + 10} y={22} className="zone-label">Season 4</text>}
          <line x1={seamX} x2={seamX} y1={HEADER_H - 8} y2={height} className="seam" />
          {ticks.map((ep) => (
            <g key={ep} transform={`translate(${episodeToX(ep, view.zoom)} 0)`}>
              <line y1={HEADER_H - 6} y2={height} className="tick" />
              <text y={22} textAnchor="middle" className="tick-label">{ep}</text>
            </g>
          ))}
        </g>

        {/* arrows: only for the thing the viewer asked about */}
        <g pointerEvents="none">
          {edges.map((e) => {
            const a = pos.get(e.from);
            const b = pos.get(e.to);
            if (!a || !b) return null;
            const same = Math.abs(a.y - b.y) < 1;
            const mx = (a.x + b.x) / 2;
            const d = same ? `M${a.x} ${a.y - 12} Q${mx} ${a.y - 44} ${b.x} ${b.y - 12}` : `M${a.x} ${a.y} C${mx} ${a.y}, ${mx} ${b.y}, ${b.x} ${b.y}`;
            return <path key={e.id} d={d} className={`edge edge-${e.type}`} markerEnd="url(#arrow)" />;
          })}
        </g>

        {/* clusters (Rule 4) */}
        {clusters.map((c) => (
          <g
            key={`${c.laneIndex}-${c.fromEp}`}
            transform={`translate(${c.x} ${laneY(c.laneIndex) + NODE_Y})`}
            role="button"
            tabIndex={0}
            aria-label={`${c.ids.length} more events in ${laneIds[c.laneIndex]}. Zoom in.`}
            className="cluster"
            style={{ opacity: focus ? 0.1 : 1 }}
            onClick={tap(() => {
              dispatch({ type: "zoom", delta: 1 });
              dispatch({ type: "cursor", ep: c.fromEp });
            })}
            onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && dispatch({ type: "zoom", delta: 1 })}
          >
            <rect x={-30} y={-22} width={60} height={44} fill="transparent" />
            <rect x={-22} y={-12} width={44} height={24} rx={12} className="cluster-pill" />
            <text textAnchor="middle" y={4} className="cluster-text">+{c.ids.length}</text>
          </g>
        ))}

        {/* event nodes */}
        {primary.map(({ node, x, laneIndex }) => {
          const y = laneY(laneIndex) + NODE_Y;
          const selected = view.selectedNode === node.id;
          return (
            <g
              key={node.id}
              transform={`translate(${x} ${y})`}
              role="button"
              tabIndex={0}
              aria-pressed={selected}
              aria-label={`${node.title}, episode ${node.watchEp}${node.isFlashback ? ", flashback" : ""}${node.confidence === "interpretation" ? ", fan theory" : ""}`}
              className={`node ${selected ? "selected" : ""} conf-${node.confidence}`}
              style={{ opacity: dim(node.id) }}
              onClick={tap(() => dispatch({ type: "select_node", id: node.id }))}
              onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), dispatch({ type: "select_node", id: node.id }))}
            >
              <circle r={22} fill="transparent" /> {/* 44px tap target */}
              {selected && <circle r={18} className="node-halo" />}
              <circle r={11} className="node-dot" style={{ stroke: `var(--lane-${node.lane}, var(--lane-default))` }} />
              <text y={4} textAnchor="middle" className="node-ep">{node.watchEp}</text>
              {node.isFlashback && <text x={13} y={-10} className="badge-flash" aria-hidden>↺</text>}
              {node.confidence === "interpretation" && <text x={13} y={-10} className="badge-theory" aria-hidden>Theory</text>}
              <text y={34} textAnchor="middle" className="node-title">{short(node.title)}</text>
            </g>
          );
        })}

        {/* characters hop lanes as allegiance changes (transform transitions; disabled under reduced motion) */}
        {laneIds.map((laneId, li) => {
          const list = byLane.get(laneId) ?? [];
          const crowded = list.length > 3 && view.zoom < 2;
          const shown = crowded ? list.filter((c) => c.id === view.selectedChar) : list;
          return (
            <g key={laneId}>
              {crowded && (
                <g transform={`translate(${cx} ${laneY(li) + CHAR_Y})`} className="char-pill" style={{ opacity: focus ? 0.1 : 1 }}>
                  <rect x={-22} y={-11} width={44} height={22} rx={11} />
                  <text textAnchor="middle" y={4}>{list.length}</text>
                </g>
              )}
              {shown.map((c, i) => {
                const ring = ringFor(c.id);
                const offset = (i - (shown.length - 1) / 2) * 26 + (crowded ? 34 : 0);
                const sel = view.selectedChar === c.id;
                return (
                  <g
                    key={c.id}
                    className={`char ${sel ? "selected" : ""}`}
                    style={{ transform: `translate(${cx + offset}px, ${laneY(li) + CHAR_Y}px)`, opacity: dim(c.id) }}
                    role="button"
                    tabIndex={0}
                    aria-label={`${c.title}${ring ? `, ${ring.replace("_", " ")}` : ""}`}
                    onClick={tap(() => dispatch({ type: "select_char", id: sel ? null : c.id }))}
                    onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), dispatch({ type: "select_char", id: sel ? null : c.id }))}
                  >
                    <circle r={22} fill="transparent" />
                    <circle r={10} className="char-dot" />
                    <text y={4} textAnchor="middle" className="char-initial">{c.title[0]}</text>
                    {ring && <StateRing state={ring} r={14} />}
                  </g>
                );
              })}
            </g>
          );
        })}

        {/* you are here */}
        <g pointerEvents="none">
          <line x1={cx} x2={cx} y1={HEADER_H - 6} y2={height} className="here-line" />
          <rect x={cx - 24} y={2} width={48} height={20} rx={10} className="here-chip" />
          <text x={cx} y={16} textAnchor="middle" className="here-text">Ep {view.cursor}</text>
        </g>
      </g>

      {/* lane labels stay put */}
      {laneIds.map((id, i) => {
        const label = graph.lanes.find((l) => l.id === id)?.label ?? id;
        return (
          <g key={id} pointerEvents="none">
            <rect x={8} y={laneY(i) + 6} width={Math.min(label.length * 7 + 14, width * 0.5)} height={20} rx={4} className="lane-tag-bg" />
            <text x={15} y={laneY(i) + 20} className="lane-tag">{label}</text>
          </g>
        );
      })}
    </svg>
  );
}
