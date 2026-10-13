"use client";
import { useState, type Dispatch } from "react";
import { EDGE_TYPES, KNOWLEDGE_STATES, type ParticipantRole, type RelationshipType } from "@/content/enums";
import type { CEpisode, CNode, CRelationship, GatedGraph } from "@/gate/types";
import {
  activeGoals,
  byWatchEp,
  characterEventsAt,
  eventParticipantsAt,
  holdersAt,
  knowledgeMatrix,
  laneOfCharacter,
  pastGoals,
  relationshipsFor,
  stateAt,
  whyTrace,
} from "@/lib/lenses";
import type { Action, ViewState } from "@/lib/viewState";
import { PathsVoid } from "./paths/PathsVoid";
import { STATE_META, StateIcon } from "./ribbon/StateGlyph";

interface P {
  graph: GatedGraph;
  view: ViewState;
  dispatch: Dispatch<Action>;
  episodes?: CEpisode[];
}

const node = (g: GatedGraph, id: string) => g.nodes.find((n) => n.id === id);
const laneLabel = (g: GatedGraph, id: string | null) => g.lanes.find((l) => l.id === id)?.label ?? "";

const TYPE_LABEL: Record<CNode["type"], string> = {
  event: "Event",
  character: "Character",
  titan: "Titan",
  concept: "Concept",
  location: "Location",
};

const ROLE_LABEL: Record<ParticipantRole, string> = {
  primary: "Primary",
  opponent: "Opponent",
  hidden_actor: "Hidden Actor",
  victim: "Victim",
  secondary: "Secondary",
  observer: "Observer",
  memory_of: "Memory",
  beneficiary: "Beneficiary",
  cause: "Cause",
};

const REL_LABEL: Record<RelationshipType, string> = {
  INHERITS_TITAN: "Inherits Titan",
  RESTRICTED_BY: "Restricted by",
  REQUIRES: "Requires",
  ENABLES: "Enables",
  CONTROLS: "Controls",
  USED_BY: "Used by",
  USES: "Uses",
  CONNECTED_THROUGH_PATHS: "Connected via Paths",
  MEMBER_OF: "Member of",
  LEADS: "Leads",
  ENEMY_OF: "Enemy of",
  INFILTRATES: "Infiltrates",
  OPPOSES: "Opposes",
  OVERTHROWS: "Overthrows",
  REBELS_AGAINST: "Rebels against",
  NEGOTIATES_WITH: "Negotiates with",
  ALLIED_WITH: "Allied with",
};

function EpBadge({ n, graph }: { n: CNode; graph: GatedGraph }) {
  const lane = laneLabel(graph, n.lane);
  return (
    <div className="badges">
      <span className={`badge type-badge type-${n.type}`}>{TYPE_LABEL[n.type]}</span>
      <span className="badge">Ep {n.watchEp}</span>
      {lane && (
        <span className="badge lane-pill" style={{ borderColor: `var(--lane-${n.lane}, var(--rule))` }}>
          {lane}
        </span>
      )}
      {n.isFlashback && <span className="badge flash">↺ Flashback</span>}
      {n.confidence === "implied" && <span className="badge">Implied</span>}
      {n.confidence === "interpretation" && <span className="badge theory">Theory</span>}
    </div>
  );
}

function Jump({ g, id, dispatch }: { g: GatedGraph; id: string; dispatch: Dispatch<Action> }) {
  const n = node(g, id);
  if (!n) return null;
  return (
    <button
      className="chip"
      onClick={() =>
        n.type === "character"
          ? dispatch({ type: "select_char", id: n.id })
          : dispatch({ type: "select_node", id: n.id, ep: n.watchEp })
      }
    >
      {n.title} <span className="dim">Ep {n.watchEp}</span>
    </button>
  );
}

function EntityChip({ g, id, dispatch }: { g: GatedGraph; id: string; dispatch: Dispatch<Action> }) {
  const n = node(g, id);
  if (n) {
    return (
      <button
        className="chip"
        onClick={() =>
          n.type === "character"
            ? dispatch({ type: "select_char", id: n.id })
            : dispatch({ type: "select_node", id: n.id, ep: n.watchEp })
        }
      >
        {n.title}
      </button>
    );
  }
  const lane = g.lanes.find((l) => l.id === id);
  if (lane) {
    return (
      <span className="badge lane-pill" style={{ borderColor: `var(--lane-${lane.id}, var(--rule))` }}>
        {lane.label}
      </span>
    );
  }
  return <span className="badge">{id}</span>;
}

function RelationshipCard({
  rel,
  selfId,
  graph,
  cursor,
  dispatch,
}: {
  rel: CRelationship;
  selfId: string;
  graph: GatedGraph;
  cursor: number;
  dispatch: Dispatch<Action>;
}) {
  const otherId = rel.sourceId === selfId ? rel.targetId : rel.sourceId;
  const isOutgoing = rel.sourceId === selfId;
  const expired = rel.expiresEp !== null && rel.expiresEp < cursor;
  return (
    <li className={`rel-card ${expired ? "rel-expired" : ""}`}>
      <div className="rel-head">
        <span className="badge rel-type">{REL_LABEL[rel.relationshipType] ?? rel.relationshipType}</span>
        <span className="dim rel-dir">{isOutgoing ? "→" : "←"}</span>
        <EntityChip g={graph} id={otherId} dispatch={dispatch} />
        <span className="badge ep-span">
          {rel.expiresEp ? `Ep ${rel.visibleFromEp}–${rel.expiresEp}` : `From Ep ${rel.visibleFromEp}`}
        </span>
      </div>
      <p className="rel-label"><strong>{rel.label}</strong></p>
      <p className="dim rel-desc">{rel.description}</p>
    </li>
  );
}

/** Node detail (spec section 4): what happened, Because, Set up in, goals, participants, and relationships at that episode. */
export function NodePanel({ graph, view, dispatch }: P) {
  const n = view.selectedNode ? node(graph, view.selectedNode) : null;
  if (!n) return null;
  const effectiveEp = Math.max(view.cursor, n.watchEp);
  const causes = graph.edges.filter((e) => e.to === n.id && e.type === "causes");
  const allEdges = graph.edges.filter((e) => e.from === n.id || e.to === n.id);
  const trace = view.lens === "why" ? whyTrace(graph, n.id, graph.theories) : null;

  // Event participants: combine rich event_participants rows with any legacy n.participants ids
  const richParticipants = n.type === "event" ? eventParticipantsAt(graph, n.id, effectiveEp) : [];
  const richEntityIds = new Set(richParticipants.map((p) => p.entityId));
  const fallbackCast = n.participants
    .filter((id) => !richEntityIds.has(id))
    .map((id) => node(graph, id))
    .filter((x): x is CNode => !!x);

  const rels = relationshipsFor(graph, n.id, effectiveEp);
  const titanHolders = n.type === "titan" ? rels.filter((r) => r.relationshipType === "INHERITS_TITAN") : [];
  const otherRels = n.type === "titan" ? rels.filter((r) => r.relationshipType !== "INHERITS_TITAN") : rels;

  return (
    <article>
      <header className="panel-header">
        <h2>{n.title}</h2>
        <EpBadge n={n} graph={graph} />
        {n.isFlashback && n.happenedIn && <p className="dim">Happened in/around: {n.happenedIn}</p>}
      </header>

      <section className="panel-section">
        <h3>{n.type === "event" ? "What happened" : "Overview"}</h3>
        <p>{n.summary}</p>
      </section>

      {n.because && (
        <section className="panel-section">
          <h3>Because</h3>
          <p>{n.because}</p>
          <ul className="why-list">
            {causes.map((e) => (
              <li key={e.id}>
                <Jump g={graph} id={e.from} dispatch={dispatch} />
                <span className="dim"> {e.whyText}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {n.setupRef && (
        <section className="panel-section">
          <h3>Set up in</h3>
          <Jump g={graph} id={n.setupRef} dispatch={dispatch} />
        </section>
      )}

      {n.type === "titan" && titanHolders.length > 0 && (
        <section className="panel-section">
          <h3>Known Titan Holders (by Ep {effectiveEp})</h3>
          <ul className="rel-list">
            {titanHolders.map((r) => (
              <RelationshipCard key={r.id} rel={r} selfId={n.id} graph={graph} cursor={effectiveEp} dispatch={dispatch} />
            ))}
          </ul>
        </section>
      )}

      {(richParticipants.length > 0 || fallbackCast.length > 0) && (
        <section className="panel-section">
          <h3>Who&apos;s involved</h3>
          <ul className="cast">
            {richParticipants.map((epRow) => {
              const c = node(graph, epRow.entityId);
              if (!c) return null;
              const goals = c.type === "character" ? activeGoals(graph, c.id, n.watchEp) : [];
              const facts = graph.facts.filter((f) => f.revealedEp <= n.watchEp);
              const states =
                c.type === "character"
                  ? facts.map((f) => ({ f, s: stateAt(graph, c.id, f.id, n.watchEp) })).filter((x) => x.s !== "not_knows")
                  : [];
              return (
                <li key={epRow.id} className="participant-card">
                  <div className="participant-top">
                    <EntityChip g={graph} id={c.id} dispatch={dispatch} />
                    <span className={`badge role-badge role-${epRow.role}`}>{ROLE_LABEL[epRow.role]}</span>
                  </div>
                  <p className="participant-note">{epRow.notes}</p>
                  {goals.map((g) => (
                    <p key={g.text} className="goal">Goal: {g.text}</p>
                  ))}
                  {states.map(({ f, s }) => (
                    <p key={f.id} className="know">
                      <StateIcon state={s} size={16} /> <span>{STATE_META[s].label}: {f.text}</span>
                    </p>
                  ))}
                </li>
              );
            })}
            {fallbackCast.map((c) => {
              const goals = activeGoals(graph, c.id, n.watchEp);
              const facts = graph.facts.filter((f) => f.revealedEp <= n.watchEp);
              const states = facts.map((f) => ({ f, s: stateAt(graph, c.id, f.id, n.watchEp) })).filter((x) => x.s !== "not_knows");
              return (
                <li key={c.id} className="participant-card">
                  <div className="participant-top">
                    <button className="chip" onClick={() => dispatch({ type: "select_char", id: c.id })}>{c.title}</button>
                  </div>
                  {goals.map((g) => (
                    <p key={g.text} className="goal">Goal: {g.text}</p>
                  ))}
                  {states.map(({ f, s }) => (
                    <p key={f.id} className="know">
                      <StateIcon state={s} size={16} /> <span>{STATE_META[s].label}: {f.text}</span>
                    </p>
                  ))}
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {otherRels.length > 0 && (
        <section className="panel-section">
          <h3>Connected Relationships</h3>
          <ul className="rel-list">
            {otherRels.map((r) => (
              <RelationshipCard key={r.id} rel={r} selfId={n.id} graph={graph} cursor={effectiveEp} dispatch={dispatch} />
            ))}
          </ul>
        </section>
      )}

      {n.type === "event" && allEdges.length > 0 && view.lens !== "why" && (
        <section className="panel-section">
          <h3>Arrow layers (max 3)</h3>
          <div className="badges">
            {EDGE_TYPES.map((et) => {
              const on = view.edgeLayers.includes(et);
              return (
                <button
                  key={et}
                  className="chip"
                  aria-pressed={on}
                  onClick={() => dispatch({ type: "toggle_edge", edge: et })}
                >
                  {et}
                </button>
              );
            })}
          </div>
        </section>
      )}

      {trace && (
        <section className="panel-section">
          <h3>Why trace</h3>
          <p className="dim">Root causes</p>
          <p>{trace.causes.size ? [...trace.causes].map((id) => <Jump key={id} g={graph} id={id} dispatch={dispatch} />) : "None yet. This is a starting point."}</p>
          <p className="dim">Direct consequences</p>
          <p>{trace.effects.size ? [...trace.effects].map((id) => <Jump key={id} g={graph} id={id} dispatch={dispatch} />) : "Nothing follows from this yet."}</p>
        </section>
      )}

      {n.depth === "paths" && <PathsVoid nodes={[n]} />}

      <div className="actions">
        {n.type === "event" && view.lens !== "why" && (
          <button className="primary" onClick={() => dispatch({ type: "lens", lens: "why" })}>Trace why</button>
        )}
        <button onClick={() => dispatch({ type: "select_node", id: null })}>Close</button>
      </div>
    </article>
  );
}

export function WhoKnowsPanel({ graph, view, dispatch }: P) {
  const holders = holdersAt(graph, view.cursor);
  const rows = knowledgeMatrix(graph, view.cursor, holders);
  const pov = view.pov;
  return (
    <article>
      <header className="panel-header">
        <h2>Who knows what</h2>
        <p className="dim">At Episode {view.cursor}. Pick a fact to see each person&apos;s state on the ribbon.</p>
      </header>

      <ul className="legend" aria-label="Legend">
        {KNOWLEDGE_STATES.map((s) => (
          <li key={s}><StateIcon state={s} /> <span>{STATE_META[s].label}</span></li>
        ))}
      </ul>

      <label className="field">
        Through the eyes of
        <select value={pov ?? ""} onChange={(e) => dispatch({ type: "pov", id: e.target.value || null })}>
          <option value="">Everyone</option>
          {holders.map((h) => <option key={h.id} value={h.id}>{h.label}</option>)}
        </select>
      </label>

      {rows.length === 0 && <p className="dim">No facts have been revealed yet.</p>}
      <ul className="facts">
        {rows.map(({ fact, cells }) => {
          const lacks = pov && cells[pov] === "not_knows"; // POV dims what that holder lacks
          return (
            <li key={fact.id} className={lacks ? "lacks" : ""}>
              <button
                className={`fact ${view.fact === fact.id ? "on" : ""}`}
                aria-pressed={view.fact === fact.id}
                onClick={() => dispatch({ type: "fact", id: view.fact === fact.id ? null : fact.id })}
              >
                <span className="badge">Ep {fact.revealedEp}</span> {fact.text}
              </button>
              <ul className="holders">
                {holders.map((h) => (
                  <li key={h.id}>
                    <StateIcon state={cells[h.id] ?? "not_knows"} size={16} />{" "}
                    <span>{h.label}: <strong>{STATE_META[cells[h.id] ?? "not_knows"].label}</strong></span>
                  </li>
                ))}
              </ul>
            </li>
          );
        })}
      </ul>
    </article>
  );
}

export function CharacterPanel({ graph, view, dispatch }: P) {
  const chars = graph.nodes.filter((n) => n.type === "character" && n.watchEp <= view.cursor);
  const c = view.selectedChar ? node(graph, view.selectedChar) : null;
  if (!c)
    return (
      <article>
        <header className="panel-header">
          <h2>Follow a character</h2>
          <p className="dim">Everything unrelated fades so you can follow one thread ({chars.length} unlocked at Ep {view.cursor}).</p>
        </header>
        <div className="chip-grid">
          {chars.length
            ? chars.map((x) => {
                const l = laneOfCharacter(graph, x.id, view.cursor);
                return (
                  <button key={x.id} className="chip" onClick={() => dispatch({ type: "select_char", id: x.id })}>
                    {x.title} {l && <span className="dim">· {laneLabel(graph, l)}</span>}
                  </button>
                );
              })
            : <p className="dim">No characters yet.</p>}
        </div>
      </article>
    );

  const lane = laneOfCharacter(graph, c.id, view.cursor);
  const historySteps = graph.laneHistory.filter((h) => h.character === c.id && h.fromEp <= view.cursor);
  const currentGoals = activeGoals(graph, c.id, view.cursor);
  const earlierGoals = pastGoals(graph, c.id, view.cursor);
  const charEvents = characterEventsAt(graph, c.id, view.cursor);
  const rels = relationshipsFor(graph, c.id, view.cursor);

  return (
    <article>
      <header className="panel-header">
        <h2>{c.title}</h2>
        <div className="badges">
          <span className="badge type-badge type-character">Character</span>
          <span className="badge">Introduced Ep {c.watchEp}</span>
          {lane && (
            <span className="badge lane-pill" style={{ borderColor: `var(--lane-${lane}, var(--rule))` }}>
              With {laneLabel(graph, lane)} at Ep {view.cursor}
            </span>
          )}
        </div>
        {c.summary && <p className="dim">{c.summary}</p>}
        {historySteps.length > 1 && (
          <p className="dim lane-trail">
            Allegiance path:{" "}
            {historySteps.map((s, idx) => (
              <span key={`${s.lane}-${s.fromEp}`}>
                {idx > 0 && " → "}
                <strong>{laneLabel(graph, s.lane)}</strong> (Ep {s.fromEp})
              </span>
            ))}
          </p>
        )}
      </header>

      <section className="panel-section">
        <h3>Goals now</h3>
        {currentGoals.map((g) => (
          <div key={g.text} className="phase-card">
            <div className="phase-head">
              {g.displayLabel && <strong>{g.displayLabel}</strong>}
              <span className="badge ep-span">
                {g.toEp ? `Ep ${g.fromEp}–${g.toEp - 1}` : `From Ep ${g.fromEp}`}
              </span>
            </div>
            <p className="phase-motive">{g.text}</p>
            {g.fear && <p className="dim phase-meta"><strong>Fear:</strong> {g.fear}</p>}
            {g.belief && <p className="dim phase-meta"><strong>Belief:</strong> {g.belief}</p>}
          </div>
        ))}
        {currentGoals.length === 0 && <p className="dim">Nothing stated yet.</p>}

        {earlierGoals.length > 0 && (
          <details className="past-phases">
            <summary className="dim">Earlier phases ({earlierGoals.length})</summary>
            <div className="past-phases-list">
              {earlierGoals.map((g) => (
                <div key={`${g.fromEp}-${g.text}`} className="phase-card past">
                  <div className="phase-head">
                    {g.displayLabel && <strong>{g.displayLabel}</strong>}
                    <span className="badge ep-span">Ep {g.fromEp}–{(g.toEp ?? view.cursor) - 1}</span>
                  </div>
                  <p>{g.text}</p>
                  {g.fear && <p className="dim phase-meta"><strong>Fear:</strong> {g.fear}</p>}
                  {g.belief && <p className="dim phase-meta"><strong>Belief:</strong> {g.belief}</p>}
                </div>
              ))}
            </div>
          </details>
        )}
      </section>

      {rels.length > 0 && (
        <section className="panel-section">
          <h3>Relationships (at Ep {view.cursor})</h3>
          <ul className="rel-list">
            {rels.map((r) => (
              <RelationshipCard key={r.id} rel={r} selfId={c.id} graph={graph} cursor={view.cursor} dispatch={dispatch} />
            ))}
          </ul>
        </section>
      )}

      <section className="panel-section">
        <h3>Route ({charEvents.length})</h3>
        <ul className="why-list">
          {charEvents.map(({ event, participant }) => (
            <li key={event.id} className="route-item">
              <div className="participant-top">
                <Jump g={graph} id={event.id} dispatch={dispatch} />
                {participant && (
                  <span className={`badge role-badge role-${participant.role}`}>{ROLE_LABEL[participant.role]}</span>
                )}
              </div>
              {participant?.notes && <p className="dim route-note">{participant.notes}</p>}
            </li>
          ))}
        </ul>
      </section>

      <div className="actions">
        <button onClick={() => dispatch({ type: "select_char", id: null })}>Stop following</button>
      </div>
    </article>
  );
}

type CodexTab = "event" | "character" | "titan" | "location" | "concept";
const CODEX_TABS: { id: CodexTab; label: string }[] = [
  { id: "event", label: "Events" },
  { id: "character", label: "Characters" },
  { id: "titan", label: "Titans" },
  { id: "location", label: "Locations" },
  { id: "concept", label: "Concepts" },
];

export function HintPanel({
  lens,
  graph,
  view,
  dispatch,
  episodes,
}: {
  lens: ViewState["lens"];
  graph?: GatedGraph;
  view?: ViewState;
  dispatch?: Dispatch<Action>;
  episodes?: CEpisode[];
}) {
  const [tab, setTab] = useState<CodexTab>("titan");
  const text =
    lens === "why"
      ? "Tap any event to trace its root causes and what it led to."
      : "Tap an event to see what happened and why. Drag the ribbon, or use the slider, to move through episodes.";

  if (!graph || !view || !dispatch) {
    return <p className="hint">{text}</p>;
  }

  const ep = episodes?.find((e) => e.episodeAbs === view.cursor);
  const unlocked = graph.nodes.filter((n) => n.watchEp <= view.cursor).sort(byWatchEp);
  const byType = (t: CodexTab) => unlocked.filter((n) => n.type === t);
  const items = byType(tab);

  return (
    <article>
      <p className="hint">{text}</p>

      {ep && (
        <section className="ep-card">
          <div className="badges">
            <span className="badge type-badge type-event">
              S{ep.season}{ep.part ? `P${ep.part}` : ""} · Ep {ep.episodeInPart} ( #{ep.episodeAbs} )
            </span>
            <span className="badge">{ep.arc}</span>
            {ep.episodeType !== "normal" && <span className="badge flash">{ep.episodeType}</span>}
          </div>
          <h2>{ep.title}</h2>
          {ep.summary && <p className="dim">{ep.summary}</p>}
        </section>
      )}

      <section className="panel-section">
        <h3>Unlocked Codex (at Ep {view.cursor})</h3>
        <div className="codex-tabs" role="tablist" aria-label="Codex categories">
          {CODEX_TABS.map((t) => {
            const count = byType(t.id).length;
            return (
              <button
                key={t.id}
                role="tab"
                aria-selected={tab === t.id}
                className={`codex-tab ${tab === t.id ? "active" : ""}`}
                onClick={() => setTab(t.id)}
              >
                {t.label} <span className="dim">({count})</span>
              </button>
            );
          })}
        </div>
        <div className="chip-grid">
          {items.length > 0 ? (
            items.map((item) => (
              <button
                key={item.id}
                className="chip"
                onClick={() =>
                  item.type === "character"
                    ? dispatch({ type: "select_char", id: item.id })
                    : dispatch({ type: "select_node", id: item.id, ep: item.watchEp })
                }
              >
                {item.title} <span className="dim">Ep {item.watchEp}</span>
              </button>
            ))
          ) : (
            <p className="dim">None unlocked at Episode {view.cursor} yet.</p>
          )}
        </div>
      </section>
    </article>
  );
}

