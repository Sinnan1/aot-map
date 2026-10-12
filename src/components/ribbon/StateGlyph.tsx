import type { KState } from "@/content/enums";

/** Rule 6: state is never colour alone. Each state has a distinct stroke pattern AND an icon. */
export const STATE_META: Record<KState, { label: string; hint: string }> = {
  knows: { label: "Knows", hint: "solid ring, check" },
  not_knows: { label: "Does not know", hint: "faded, empty" },
  believes_falsely: { label: "Believes falsely", hint: "dashed ring, warning" },
  hides: { label: "Hides", hint: "dotted ring, lock" },
};

function Glyph({ state }: { state: KState }) {
  switch (state) {
    case "knows":
      return <path d="M-3.2 0.2 L-1 2.6 L3.4 -2.4" className="st-icon" />;
    case "believes_falsely":
      return (
        <g className="st-icon">
          <path d="M0 -3.8 L4.2 3.2 L-4.2 3.2 Z" />
          <path d="M0 -1 V1.2" />
        </g>
      );
    case "hides":
      return (
        <g className="st-icon">
          <rect x="-3" y="-0.8" width="6" height="4.6" rx="0.8" />
          <path d="M-1.8 -0.8 V-2.4 a1.8 1.8 0 0 1 3.6 0 V-0.8" />
        </g>
      );
    case "not_knows":
      return null;
  }
}

/** Ring drawn around a character dot (SVG group, centred at 0,0). */
export function StateRing({ state, r }: { state: KState; r: number }) {
  return (
    <g className={`st st-${state}`} aria-hidden>
      <circle r={r} className="st-ring" />
      <g transform={`translate(${r * 0.9} ${-r * 0.9}) scale(0.9)`}>
        <circle r="5.6" className="st-chip" />
        <Glyph state={state} />
      </g>
    </g>
  );
}

/** Standalone icon for lists and the legend. */
export function StateIcon({ state, size = 20 }: { state: KState; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="-8 -8 16 16" className={`st st-${state}`} role="img" aria-label={STATE_META[state].label}>
      <circle r="6.4" className="st-ring" />
      <Glyph state={state} />
    </svg>
  );
}
