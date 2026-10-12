"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useReducer, useRef, useState } from "react";
import { FINALE_EP } from "@/config";
import type { GatedGraph, SearchHit } from "@/gate/types";
import { byWatchEp, characterRoute, connected, edgesTouching, laneOfCharacter, stateAt, whyTrace } from "@/lib/lenses";
import { initialView, viewReducer, type Lens } from "@/lib/viewState";
import { CharacterPanel, HintPanel, NodePanel, WhoKnowsPanel } from "./Panels";
import { SearchBox } from "./SearchBox";
import { Ribbon } from "./ribbon/Ribbon";
import { episodeToX, placeEvents, selectPrimary } from "./ribbon/layout";

const LENSES: { id: Lens; label: string }[] = [
  { id: "timeline", label: "Timeline" },
  { id: "who_knows", label: "Who knows" },
  { id: "character", label: "Character" },
  { id: "why", label: "Why" },
];

function useWidth() {
  const ref = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(390);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => e && setW(Math.round(e.contentRect.width)));
    ro.observe(el);
    setW(Math.round(el.getBoundingClientRect().width));
    return () => ro.disconnect();
  }, []);
  return [ref, w] as const;
}

type Snap = "peek" | "half" | "full";
const NEXT_SNAP: Record<Snap, Snap> = { peek: "half", half: "full", full: "peek" };

export function MapApp({ graph }: { graph: GatedGraph }) {
  const router = useRouter();
  const [view, dispatch] = useReducer(viewReducer, graph.progress, initialView);
  const [wrapRef, width] = useWidth();
  const [snap, setSnap] = useState<Snap>("peek");
  const [searching, setSearching] = useState(false);
  const [advancing, setAdvancing] = useState(false);
  const dragY = useRef<number | null>(null);

  useEffect(() => dispatch({ type: "progress", progress: graph.progress }), [graph.progress]);

  // Phones show 3 lanes at a time; start on the lane with the latest activity.
  const phone = width < 640;
  const laneCount = phone ? 3 : 6;
  const maxStart = Math.max(0, graph.lanes.length - laneCount);
  const laneStart = Math.min(view.laneStart, maxStart);
  const laneIds = graph.lanes.slice(laneStart, laneStart + laneCount).map((l) => l.id);
  useEffect(() => {
    const latest = graph.nodes.filter((n) => n.type === "event").sort(byWatchEp).at(-1);
    const idx = graph.lanes.findIndex((l) => l.id === latest?.lane);
    if (idx >= 0) dispatch({ type: "lane_start", start: idx - 1 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Selecting something opens the sheet.
  useEffect(() => {
    if (view.selectedNode || view.selectedChar) setSnap((s) => (s === "peek" ? "half" : s));
  }, [view.selectedNode, view.selectedChar]);

  // Contextual fading (Rule 2) and arrows on request only.
  const { focus, edges } = useMemo(() => {
    if (view.lens === "why" && view.selectedNode) {
      const t = whyTrace(graph, view.selectedNode, graph.theories);
      return { focus: new Set([view.selectedNode, ...t.causes, ...t.effects]), edges: t.edges };
    }
    if (view.lens === "character" && view.selectedChar) return { focus: characterRoute(graph, view.selectedChar), edges: [] };
    if (view.selectedNode) return { focus: connected(graph, view.selectedNode), edges: edgesTouching(graph, view.selectedNode, view.edgeLayers) };
    return { focus: null, edges: [] };
  }, [graph, view.lens, view.selectedNode, view.selectedChar, view.edgeLayers]);

  const placed = useMemo(() => placeEvents(graph.nodes, laneIds, view.zoom), [graph.nodes, laneIds.join("|"), view.zoom]); // eslint-disable-line react-hooks/exhaustive-deps
  const cx = episodeToX(view.cursor, view.zoom);
  const viewLeft = cx - width * 0.6;
  const cap = (phone ? 5 : 7) * view.zoom; // Rule of 7 (5 on phones)
  const keep = useMemo(() => new Set<string>([...(focus ?? []), ...(view.selectedNode ? [view.selectedNode] : [])]), [focus, view.selectedNode]);
  const { primary, clusters } = useMemo(() => selectPrimary(placed, viewLeft, viewLeft + width, cap, keep, cx), [placed, viewLeft, width, cap, keep, cx]);

  const charLane = useMemo(() => new Map(graph.nodes.filter((n) => n.type === "character").map((n) => [n.id, laneOfCharacter(graph, n.id, view.cursor)])), [graph, view.cursor]);
  const ringFor = (id: string) => (view.lens === "who_knows" && view.fact && graph.facts.some((f) => f.id === view.fact && f.revealedEp <= view.cursor) ? stateAt(graph, id, view.fact, view.cursor) : null);

  const events = useMemo(() => graph.nodes.filter((n) => n.type === "event").sort((a, b) => a.watchEp - b.watchEp || a.tier - b.tier || a.id.localeCompare(b.id)), [graph.nodes]);
  const step = (dir: 1 | -1) => {
    const i = view.selectedNode ? events.findIndex((e) => e.id === view.selectedNode) : -1;
    const target = i >= 0 ? events[i + dir] : dir === 1 ? events.find((e) => e.watchEp >= view.cursor) : [...events].reverse().find((e) => e.watchEp <= view.cursor);
    if (target) dispatch({ type: "select_node", id: target.id, ep: target.watchEp });
  };

  const advance = async () => {
    setAdvancing(true);
    try {
      await fetch("/api/progress", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ advance: true }) });
      router.refresh();
    } finally {
      setAdvancing(false);
    }
  };

  const pick = (h: SearchHit) => {
    setSearching(false);
    if (h.type === "character") dispatch({ type: "select_char", id: h.id });
    else dispatch({ type: "select_node", id: h.id, ep: h.watchEp });
  };

  const onHandleDown = (e: React.PointerEvent) => {
    dragY.current = e.clientY;
    (e.currentTarget as Element).setPointerCapture(e.pointerId);
  };
  const onHandleUp = (e: React.PointerEvent) => {
    if (dragY.current === null) return;
    const dy = e.clientY - dragY.current;
    dragY.current = null;
    if (Math.abs(dy) < 8) return setSnap((s) => NEXT_SNAP[s]);
    setSnap((s) => (dy < 0 ? (s === "peek" ? "half" : "full") : s === "full" ? "half" : "peek"));
  };

  const empty = graph.progress < 1;
  const panel =
    view.selectedNode ? <NodePanel graph={graph} view={view} dispatch={dispatch} />
    : view.lens === "who_knows" ? <WhoKnowsPanel graph={graph} view={view} dispatch={dispatch} />
    : view.lens === "character" ? <CharacterPanel graph={graph} view={view} dispatch={dispatch} />
    : <HintPanel lens={view.lens} />;

  return (
    <div className="app">
      <header className="top">
        <div className="top-row">
          <p className="progress" aria-live="polite">
            {graph.rewatch ? <>Rewatch <span className="dim">all episodes</span></> : <>Watched through <strong>Ep {graph.progress}</strong></>}
          </p>
          {!graph.rewatch && (
            <button className="next-ep" onClick={advance} disabled={advancing || graph.progress >= FINALE_EP}>I watched the next episode</button>
          )}
          <button className="icon" aria-label="Search" aria-expanded={searching} onClick={() => setSearching((s) => !s)}>⌕</button>
          <Link className="icon" href="/" aria-label="Change episode">⚙</Link>
        </div>
        {searching && <SearchBox onPick={pick} />}
        <div className="lenses" role="group" aria-label="Lens">
          {LENSES.map((l) => (
            <button key={l.id} aria-pressed={view.lens === l.id} onClick={() => dispatch({ type: "lens", lens: l.id })}>{l.label}</button>
          ))}
        </div>
      </header>

      <div className="stage">
        <div className="ribbon-wrap" ref={wrapRef}>
          {empty ? (
            <div className="empty">
              <h2>Nothing unlocked yet</h2>
              <p>Watch Episode 1, then tap &ldquo;I watched the next episode&rdquo;. The map grows as you do.</p>
              <button className="primary" onClick={advance} disabled={advancing}>I watched Episode 1</button>
            </div>
          ) : (
            <>
              <Ribbon graph={graph} view={view} dispatch={dispatch} width={width} laneIds={laneIds} primary={primary} clusters={clusters} focus={focus} edges={edges} charLane={charLane} ringFor={ringFor} />
              {graph.lanes.length > laneCount && (
                <div className="lane-switch" role="group" aria-label="Lanes">
                  <button aria-label="Lanes up" disabled={laneStart === 0} onClick={() => dispatch({ type: "lane_start", start: laneStart - 1 })}>▲</button>
                  <button aria-label="Lanes down" disabled={laneStart >= maxStart} onClick={() => dispatch({ type: "lane_start", start: laneStart + 1 })}>▼</button>
                </div>
              )}
            </>
          )}
        </div>

        <aside className="sheet" data-snap={snap} aria-label="Details">
          <button className="handle" aria-label="Resize details" onPointerDown={onHandleDown} onPointerUp={onHandleUp}><span /></button>
          <div className="sheet-body">{panel}</div>
        </aside>
      </div>

      <footer className="bottom">
        <div className="scrub">
          <button aria-label="Previous event" onClick={() => step(-1)} disabled={empty}>‹</button>
          <input type="range" min={1} max={Math.max(graph.progress, 1)} value={Math.max(view.cursor, 1)} disabled={empty} aria-label="Episode" aria-valuetext={`Episode ${view.cursor}`} onChange={(e) => dispatch({ type: "cursor", ep: Number(e.target.value) })} />
          <button aria-label="Next event" onClick={() => step(1)} disabled={empty}>›</button>
        </div>
        <div className="bottom-row">
          <button className="primary" onClick={() => dispatch({ type: "return_main" })}>Return to Main Thread</button>
          <div className="zoom" role="group" aria-label="Zoom">
            <button aria-label="Zoom out" disabled={view.zoom === 1} onClick={() => dispatch({ type: "zoom", delta: -1 })}>−</button>
            <button aria-label="Zoom in" disabled={view.zoom === 3} onClick={() => dispatch({ type: "zoom", delta: 1 })}>+</button>
          </div>
        </div>
      </footer>
    </div>
  );
}
