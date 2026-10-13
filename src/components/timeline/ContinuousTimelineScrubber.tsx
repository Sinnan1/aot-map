"use client";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { FINALE_EP } from "@/config";
import type { CEpisode } from "@/gate/types";
import { playGearClick } from "@/lib/sound";
import { useTimelineStore } from "@/store/timelineStore";

interface SeasonBand {
  id: string;
  label: string;
  startEp: number;
  endEp: number;
}

const SEASONS: SeasonBand[] = [
  { id: "s1", label: "S1", startEp: 1, endEp: 25 },
  { id: "s2", label: "S2", startEp: 26, endEp: 37 },
  { id: "s3p1", label: "S3 P1", startEp: 38, endEp: 48 },
  { id: "s3p2", label: "S3 P2", startEp: 49, endEp: 59 },
  { id: "s4p1", label: "S4 P1", startEp: 60, endEp: 75 },
  { id: "s4p2", label: "S4 P2", startEp: 76, endEp: 87 },
  { id: "finale", label: "Finale", startEp: 88, endEp: 89 },
];

const HISTORIC_ARCS = [
  { ep: 1, title: "Fall of Shiganshina" },
  { ep: 5, title: "Battle of Trost" },
  { ep: 17, title: "Female Titan" },
  { ep: 31, title: "Warrior Betrayal" },
  { ep: 38, title: "Royal Coup" },
  { ep: 49, title: "Return to Shiganshina" },
  { ep: 56, title: "The Basement" },
  { ep: 60, title: "Marley War" },
  { ep: 64, title: "Declaration of War" },
  { ep: 71, title: "Yeagerist Faction" },
  { ep: 76, title: "War for Paradis" },
  { ep: 80, title: "Rumbling Begins" },
  { ep: 88, title: "Battle of Heaven and Earth" },
];

export function ContinuousTimelineScrubber() {
  const cursor = useTimelineStore((state) => state.cursor);
  const progress = useTimelineStore((state) => state.progress);
  const isPlaying = useTimelineStore((state) => state.isPlaying);
  const episodes = useTimelineStore((state) => state.episodes);
  const setCursor = useTimelineStore((state) => state.setCursor);
  const stepCursor = useTimelineStore((state) => state.stepCursor);
  const setIsPlaying = useTimelineStore((state) => state.setIsPlaying);
  const zoom = useTimelineStore((state) => state.zoom);
  const setZoom = useTimelineStore((state) => state.setZoom);
  const returnToMain = useTimelineStore((state) => state.returnToMain);

  const [hoverEp, setHoverEp] = useState<number | null>(null);
  const [showArcs, setShowArcs] = useState(false);
  const playTimerRef = useRef<NodeJS.Timeout | null>(null);

  const maxEp = Math.max(progress, 1);
  const activeEp = hoverEp ?? cursor;
  const currentEpData = useMemo<CEpisode | undefined>(
    () => episodes.find((e) => e.episodeAbs === activeEp),
    [episodes, activeEp]
  );

  // Auto-play interval
  useEffect(() => {
    if (isPlaying) {
      playTimerRef.current = setInterval(() => {
        const curr = useTimelineStore.getState().cursor;
        const prog = useTimelineStore.getState().progress;
        if (curr >= prog) {
          setIsPlaying(false);
        } else {
          useTimelineStore.getState().setCursor(curr + 1);
          playGearClick();
        }
      }, 1200);
    } else if (playTimerRef.current) {
      clearInterval(playTimerRef.current);
      playTimerRef.current = null;
    }
    return () => {
      if (playTimerRef.current) clearInterval(playTimerRef.current);
    };
  }, [isPlaying, setIsPlaying]);

  const handleSliderChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const nextVal = Number(e.target.value);
    setCursor(nextVal);
    playGearClick();
  };

  const jumpTo = (ep: number) => {
    setCursor(Math.min(ep, progress));
    playGearClick();
  };

  return (
    <div className="continuous-scrubber" role="region" aria-label="Continuous Timeline Scrubber">
      {/* Arc Quick Jumps Ribbon */}
      {showArcs && (
        <div className="scrubber-arcs-tray" role="group" aria-label="Historic story arcs">
          <div className="scrubber-arcs-scroll">
            {HISTORIC_ARCS.filter((a) => a.ep <= progress).map((arc) => (
              <button
                key={arc.ep}
                className={`arc-pill ${cursor === arc.ep ? "active" : ""}`}
                onClick={() => jumpTo(arc.ep)}
              >
                <span className="arc-ep">Ep {arc.ep}</span>
                <span className="arc-title">{arc.title}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Main Timeline Track & Season Banners */}
      <div className="scrubber-track-container">
        <div className="season-markers" aria-hidden="true">
          {SEASONS.filter((s) => s.startEp <= progress).map((season) => {
            const visibleEnd = Math.min(season.endEp, progress);
            const widthPct = ((visibleEnd - season.startEp + 1) / maxEp) * 100;
            return (
              <button
                key={season.id}
                type="button"
                className="season-chip"
                style={{ width: `${widthPct}%` }}
                onClick={() => jumpTo(season.startEp)}
                title={`Jump to ${season.label} (Ep ${season.startEp})`}
              >
                {season.label}
              </button>
            );
          })}
        </div>

        <div className="slider-wrapper">
          <input
            type="range"
            min={1}
            max={maxEp}
            value={cursor}
            onChange={handleSliderChange}
            aria-label="Episode timeline"
            aria-valuetext={`Episode ${cursor}`}
            className="timeline-slider"
          />
        </div>
      </div>

      {/* Control Strip & Episode Meta */}
      <div className="scrubber-controls-bar">
        <div className="playback-group">
          <button
            type="button"
            className="ctrl-btn"
            onClick={() => {
              stepCursor(-1);
              playGearClick();
            }}
            title="Previous Event (or Episode)"
            aria-label="Previous Event"
          >
            ‹
          </button>
          <button
            type="button"
            className={`ctrl-btn play-btn ${isPlaying ? "playing" : ""}`}
            onClick={() => setIsPlaying(!isPlaying)}
            title={isPlaying ? "Pause Timeline Auto-advance" : "Play Timeline Auto-advance"}
            aria-label={isPlaying ? "Pause" : "Play"}
          >
            {isPlaying ? "❚❚" : "▶"}
          </button>
          <button
            type="button"
            className="ctrl-btn"
            onClick={() => {
              stepCursor(1);
              playGearClick();
            }}
            title="Next Event (or Episode)"
            aria-label="Next Event"
          >
            ›
          </button>
          <button
            type="button"
            className={`ctrl-btn arc-toggle-btn ${showArcs ? "active" : ""}`}
            onClick={() => setShowArcs(!showArcs)}
            title="Toggle Key Story Arcs"
          >
            Story Arcs
          </button>
        </div>

        {/* Dynamic Episode Card Display */}
        <div className="episode-meta-display" aria-live="polite">
          <span className="ep-badge-pill">Ep {cursor} / {FINALE_EP}</span>
          {currentEpData ? (
            <span className="ep-title-text">
              <span className="season-label">S{currentEpData.season}{currentEpData.part ? `P${currentEpData.part}` : ""}:</span>{" "}
              <strong>{currentEpData.title}</strong>
            </span>
          ) : (
            <span className="ep-title-text">Episode {cursor}</span>
          )}
        </div>

        {/* Actions & Zoom */}
        <div className="secondary-controls">
          <button
            type="button"
            className="return-main-btn"
            onClick={returnToMain}
            title="Reset focus to current watch frontier"
          >
            Reset Frontier
          </button>
          <div className="zoom-group">
            <button
              type="button"
              className="ctrl-btn zoom-btn"
              disabled={zoom === 1}
              onClick={() => setZoom(-1)}
              title="Zoom out"
              aria-label="Zoom out"
            >
              −
            </button>
            <button
              type="button"
              className="ctrl-btn zoom-btn"
              disabled={zoom === 3}
              onClick={() => setZoom(1)}
              title="Zoom in"
              aria-label="Zoom in"
            >
              +
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
