"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, useCallback, type Dispatch } from "react";
import { FINALE_EP } from "@/config";
import type { CEpisode, GatedGraph, SearchHit } from "@/gate/types";
import { CharacterPanel, HintPanel, NodePanel, WhoKnowsPanel } from "./Panels";
import { SearchBox } from "./SearchBox";
import { FlowCanvas } from "./flow/FlowCanvas";
import { ContinuousTimelineScrubber } from "./timeline/ContinuousTimelineScrubber";
import { useTimelineStore } from "@/store/timelineStore";
import type { Action, ViewState, Lens } from "@/lib/viewState";
import { isSoundEnabled, toggleSound } from "@/lib/sound";

const LENSES: { id: Lens; label: string }[] = [
  { id: "timeline", label: "Timeline" },
  { id: "who_knows", label: "Who knows" },
  { id: "character", label: "Character" },
  { id: "why", label: "Why" },
];

type Snap = "peek" | "half" | "full";
const NEXT_SNAP: Record<Snap, Snap> = { peek: "half", half: "full", full: "peek" };

export function MapApp({ graph, episodes }: { graph: GatedGraph; episodes?: CEpisode[] }) {
  const router = useRouter();

  // Zustand Store Integration
  const cursor = useTimelineStore((state) => state.cursor);
  const progress = useTimelineStore((state) => state.progress);
  const lens = useTimelineStore((state) => state.lens);
  const selectedNodeId = useTimelineStore((state) => state.selectedNodeId);
  const selectedCharId = useTimelineStore((state) => state.selectedCharId);
  const fact = useTimelineStore((state) => state.fact);
  const pov = useTimelineStore((state) => state.pov);
  const edgeLayers = useTimelineStore((state) => state.edgeLayers);
  const zoom = useTimelineStore((state) => state.zoom);
  const laneStart = useTimelineStore((state) => state.laneStart);

  const [snap, setSnap] = useState<Snap>("peek");
  const [searching, setSearching] = useState(false);
  const [advancing, setAdvancing] = useState(false);
  const [soundOn, setSoundOn] = useState(true);
  const dragY = useRef<number | null>(null);

  // Initialize Zustand store with incoming server-gated data
  useEffect(() => {
    useTimelineStore.getState().init(graph, episodes);
    setSoundOn(isSoundEnabled());
  }, [graph, episodes]);

  // Construct view compatibility object for Panels
  const view: ViewState = useMemo(
    () => ({
      progress,
      cursor,
      lens,
      selectedNode: selectedNodeId,
      selectedChar: selectedCharId,
      fact,
      pov,
      edgeLayers,
      zoom,
      laneStart,
    }),
    [progress, cursor, lens, selectedNodeId, selectedCharId, fact, pov, edgeLayers, zoom, laneStart]
  );

  // Dispatch adapter syncing with Zustand
  const dispatch: Dispatch<Action> = useCallback((action: Action) => {
    const store = useTimelineStore.getState();
    switch (action.type) {
      case "cursor":
        store.setCursor(action.ep);
        break;
      case "select_node":
        store.selectNode(action.id, action.ep);
        break;
      case "select_char":
        store.selectChar(action.id);
        break;
      case "lens":
        store.setLens(action.lens);
        break;
      case "fact":
        store.setFact(action.id);
        break;
      case "pov":
        store.setPov(action.id);
        break;
      case "toggle_edge":
        store.toggleEdge(action.edge);
        break;
      case "zoom":
        store.setZoom(action.delta);
        break;
      case "lane_start":
        store.setLaneStart(action.start);
        break;
      case "return_main":
        store.returnToMain();
        break;
      case "progress":
        // Server controls progress
        break;
    }
  }, []);

  // Selecting something opens the sheet.
  useEffect(() => {
    if (selectedNodeId || selectedCharId) setSnap((s) => (s === "peek" ? "half" : s));
  }, [selectedNodeId, selectedCharId]);

  const advance = async () => {
    setAdvancing(true);
    try {
      await fetch("/api/progress", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ advance: true }),
      });
      router.refresh();
    } finally {
      setAdvancing(false);
    }
  };

  const toggleTheories = async () => {
    setAdvancing(true);
    try {
      await fetch("/api/progress", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ theories: !graph.theories }),
      });
      router.refresh();
    } finally {
      setAdvancing(false);
    }
  };

  const handleSoundToggle = () => {
    const updated = toggleSound();
    setSoundOn(updated);
  };

  const pick = (h: SearchHit) => {
    setSearching(false);
    if (h.type === "character") useTimelineStore.getState().selectChar(h.id);
    else useTimelineStore.getState().selectNode(h.id, h.watchEp);
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

  const panel = selectedNodeId ? (
    <NodePanel graph={graph} view={view} dispatch={dispatch} episodes={episodes} />
  ) : lens === "who_knows" ? (
    <WhoKnowsPanel graph={graph} view={view} dispatch={dispatch} episodes={episodes} />
  ) : lens === "character" ? (
    <CharacterPanel graph={graph} view={view} dispatch={dispatch} episodes={episodes} />
  ) : (
    <HintPanel lens={lens} graph={graph} view={view} dispatch={dispatch} episodes={episodes} />
  );

  return (
    <div className="app">
      <header className="top">
        <div className="top-row">
          <p className="progress" aria-live="polite">
            {graph.rewatch ? (
              <>
                Rewatch <span className="dim">all {FINALE_EP} episodes</span>
              </>
            ) : (
              <>
                Watched through <strong>Ep {graph.progress}</strong>
              </>
            )}
          </p>
          {!graph.rewatch && (
            <button
              className="next-ep"
              onClick={advance}
              disabled={advancing || graph.progress >= FINALE_EP}
            >
              I watched the next episode
            </button>
          )}
          <button
            className="icon"
            aria-label={soundOn ? "Mute audio" : "Enable sound"}
            title={soundOn ? "Audio FX On" : "Audio FX Off"}
            onClick={handleSoundToggle}
          >
            {soundOn ? "🔊" : "🔇"}
          </button>
          <button
            className="icon"
            aria-label="Search"
            aria-expanded={searching}
            onClick={() => setSearching((s) => !s)}
          >
            ⌕
          </button>
          <Link className="icon" href="/" aria-label="Change episode">
            ⚙
          </Link>
        </div>

        {searching && <SearchBox onPick={pick} />}

        <div className="lenses" role="group" aria-label="Lens">
          {LENSES.map((l) => (
            <button
              key={l.id}
              aria-pressed={lens === l.id}
              onClick={() => useTimelineStore.getState().setLens(l.id)}
            >
              {l.label}
            </button>
          ))}
          <button
            className="theory-toggle"
            aria-pressed={graph.theories}
            disabled={advancing}
            onClick={toggleTheories}
            title="Include fan theories and interpretations"
          >
            Theories {graph.theories ? "On" : "Off"}
          </button>
        </div>
      </header>

      <div className="stage">
        <div className="ribbon-wrap">
          {empty ? (
            <div className="empty">
              <h2>Nothing unlocked yet</h2>
              <p>Watch Episode 1, then tap &ldquo;I watched the next episode&rdquo;. The map grows as you do.</p>
              <button className="primary" onClick={advance} disabled={advancing}>
                I watched Episode 1
              </button>
            </div>
          ) : (
            <FlowCanvas />
          )}
        </div>

        <aside className="sheet" data-snap={snap} aria-label="Details">
          <button
            className="handle"
            aria-label="Resize details"
            onPointerDown={onHandleDown}
            onPointerUp={onHandleUp}
          >
            <span />
          </button>
          <div className="sheet-body">{panel}</div>
        </aside>
      </div>

      {/* Modern Continuous Scrubber driven by Zustand store */}
      {!empty && <ContinuousTimelineScrubber />}
    </div>
  );
}
