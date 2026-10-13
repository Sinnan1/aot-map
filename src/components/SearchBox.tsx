"use client";
import { useEffect, useState } from "react";
import type { SearchHit } from "@/gate/types";

const HIT_TYPE_LABEL: Record<SearchHit["type"], string> = {
  event: "Event",
  character: "Character",
  titan: "Titan",
  concept: "Concept",
  location: "Location",
};

/** Search runs against the gated index, so a result can never reveal something past the viewer's episode. */
export function SearchBox({ onPick }: { onPick: (hit: SearchHit) => void }) {
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<SearchHit[]>([]);

  useEffect(() => {
    if (q.trim().length < 2) return setHits([]);
    const ctl = new AbortController();
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`, { signal: ctl.signal });
        if (res.ok) setHits(await res.json());
      } catch {
        /* aborted */
      }
    }, 180);
    return () => {
      clearTimeout(t);
      ctl.abort();
    };
  }, [q]);

  return (
    <div className="search">
      <input
        type="search"
        value={q}
        autoFocus
        placeholder="Search characters, events, Titans, locations, aliases…"
        aria-label="Search what you've watched"
        onChange={(e) => setQ(e.target.value)}
        onKeyDown={(e) => e.key === "Escape" && setQ("")}
      />
      {q.trim().length >= 2 && (
        <ul role="listbox" aria-label="Search results">
          {hits.map((h) => (
            <li key={h.id}>
              <button
                onClick={() => {
                  onPick(h);
                  setQ("");
                }}
              >
                <span className={`badge type-badge type-${h.type}`}>{HIT_TYPE_LABEL[h.type]}</span>{" "}
                <strong>{h.title}</strong> <span className="dim">Ep {h.watchEp}</span>
              </button>
            </li>
          ))}
          {hits.length === 0 && <li className="dim empty">Nothing in what you&apos;ve watched matches.</li>}
        </ul>
      )}
    </div>
  );
}

