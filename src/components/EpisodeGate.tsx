"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { FINALE_EP, SEASONS } from "@/config";
import type { Gate } from "@/gate/gate";

async function setGate(body: object) {
  const res = await fetch("/api/progress", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  if (!res.ok) throw new Error("Could not save your progress");
}

export function EpisodeGate({ current }: { current: Gate | null }) {
  const router = useRouter();
  const [custom, setCustom] = useState(current && !current.rewatch && current.progress > 0 ? current.progress : 64);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const go = async (body: object) => {
    setBusy(true);
    setError(null);
    try {
      await setGate(body);
      router.push("/map");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
      setBusy(false);
    }
  };

  return (
    <main className="gate">
      <h1>Where are you in the story?</h1>
      <p className="lede">
        The map only knows what you&apos;ve watched. Anything past your episode is never loaded onto this device, so there is nothing to
        accidentally see.
      </p>

      <div className="gate-picks">
        <button disabled={busy} onClick={() => go({ progress: 0 })}>
          <strong>New to the show</strong>
          <span>Start with nothing unlocked</span>
        </button>
        <button disabled={busy} onClick={() => go({ progress: 59 })}>
          <strong>Finished Season 3</strong>
          <span>Through Episode 59</span>
        </button>
      </div>

      <form
        className="gate-custom"
        onSubmit={(e) => {
          e.preventDefault();
          void go({ progress: custom });
        }}
      >
        <label htmlFor="ep">I&apos;ve watched up to</label>
        <select id="ep" value={custom} onChange={(e) => setCustom(Number(e.target.value))}>
          {SEASONS.map((s) => (
            <optgroup key={s.label} label={s.label}>
              {Array.from({ length: s.to - s.from + 1 }, (_, i) => s.from + i).map((n) => (
                <option key={n} value={n}>
                  Episode {n}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
        <button type="submit" disabled={busy} className="primary">
          Open the map
        </button>
      </form>

      <button className="link" disabled={busy} onClick={() => go({ rewatch: true })}>
        I&apos;ve seen it all, show everything (Rewatch, through Episode {FINALE_EP})
      </button>
      {current && !error && (
        <button className="link" onClick={() => router.push("/map")}>
          Keep going from {current.rewatch ? "Rewatch" : `Episode ${current.progress}`}
        </button>
      )}
      {error && <p role="alert" className="error">{error}. Try again.</p>}
    </main>
  );
}
