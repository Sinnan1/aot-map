"use client";
import type { Dispatch } from "react";
import { KNOWLEDGE_STATES } from "@/content/enums";
import type { CNode, GatedGraph } from "@/gate/types";
import { activeGoals, holdersAt, knowledgeMatrix, laneOfCharacter, stateAt, whyTrace } from "@/lib/lenses";
import type { Action, ViewState } from "@/lib/viewState";
import { PathsVoid } from "./paths/PathsVoid";
import { STATE_META, StateIcon } from "./ribbon/StateGlyph";

interface P {
  graph: GatedGraph;
  view: ViewState;
  dispatch: Dispatch<Action>;
}

const node = (g: GatedGraph, id: string) => g.nodes.find((n) => n.id === id);
const laneLabel = (g: GatedGraph, id: string | null) => g.lanes.find((l) => l.id === id)?.label ?? "";

function EpBadge({ n }: { n: CNode }) {
  return (
    <div className="badges">
      <span className="badge">Ep {n.watchEp}</span>
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
    <button className="chip" onClick={() => dispatch({ type: "select_node", id: n.id, ep: n.watchEp })}>
      {n.title} <span className="dim">Ep {n.watchEp}</span>
    </button>
  );
}

/** Node detail (spec section 4): what happened, Because, Set up in, goals and knowledge at that episode. */
export function NodePanel({ graph, view, dispatch }: P) {
  const n = view.selectedNode ? node(graph, view.selectedNode) : null;
  if (!n) return null;
  const causes = graph.edges.filter((e) => e.to === n.id && e.type === "causes");
  const trace = view.lens === "why" ? whyTrace(graph, n.id, graph.theories) : null;
  const cast = n.participants.map((id) => node(graph, id)).filter((x): x is CNode => !!x);

  return (
    <article>
      <header>
        <h2>{n.title}</h2>
        <EpBadge n={n} />
        {n.isFlashback && n.happenedIn && <p className="dim">Happened in/around: {n.happenedIn}</p>}
        <p className="dim">{laneLabel(graph, n.lane)}</p>
      </header>

      <section>
        <h3>{n.type === "event" ? "What happened" : "Overview"}</h3>
        <p>{n.summary}</p>
      </section>

      {n.because && (
        <section>
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
        <section>
          <h3>Set up in</h3>
          <Jump g={graph} id={n.setupRef} dispatch={dispatch} />
        </section>
      )}

      {cast.length > 0 && (
        <section>
          <h3>Who&apos;s involved</h3>
          <ul className="cast">
            {cast.map((c) => {
              const goals = activeGoals(graph, c.id, n.watchEp);
              const facts = graph.facts.filter((f) => f.revealedEp <= n.watchEp);
              const states = facts.map((f) => ({ f, s: stateAt(graph, c.id, f.id, n.watchEp) })).filter((x) => x.s !== "not_knows");
              return (
                <li key={c.id}>
                  <button className="chip" onClick={() => dispatch({ type: "select_char", id: c.id })}>{c.title}</button>
                  {goals.map((g) => (
                    <p key={g.text} className="goal">Goal: {g.text}</p>
                  ))}
                  {states.map(({ f, s }) => (
                    <p key={f.id} className="know"><StateIcon state={s} size={16} /> <span>{STATE_META[s].label}: {f.text}</span></p>
                  ))}
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {trace && (
        <section>
          <h3>Why trace</h3>
          <p className="dim">Root causes</p>
          <p>{trace.causes.size ? [...trace.causes].map((id) => <Jump key={id} g={graph} id={id} dispatch={dispatch} />) : "None yet. This is a starting point."}</p>
          <p className="dim">Direct consequences</p>
          <p>{trace.effects.size ? [...trace.effects].map((id) => <Jump key={id} g={graph} id={id} dispatch={dispatch} />) : "Nothing follows from this yet."}</p>
        </section>
      )}

      {n.depth === "paths" && <PathsVoid nodes={[n]} />}

      <div className="actions">
        {n.type === "event" && view.lens !== "why" && <button className="primary" onClick={() => dispatch({ type: "lens", lens: "why" })}>Trace why</button>}
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
      <header>
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
              <button className={`fact ${view.fact === fact.id ? "on" : ""}`} aria-pressed={view.fact === fact.id} onClick={() => dispatch({ type: "fact", id: view.fact === fact.id ? null : fact.id })}>
                {fact.text}
              </button>
              <ul className="holders">
                {holders.map((h) => (
                  <li key={h.id}><StateIcon state={cells[h.id] ?? "not_knows"} size={16} /> {h.label}: {STATE_META[cells[h.id] ?? "not_knows"].label}</li>
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
        <header><h2>Follow a character</h2><p className="dim">Everything unrelated fades so you can follow one thread.</p></header>
        <p>{chars.length ? chars.map((x) => <button key={x.id} className="chip" onClick={() => dispatch({ type: "select_char", id: x.id })}>{x.title}</button>) : "No characters yet."}</p>
      </article>
    );
  const lane = laneOfCharacter(graph, c.id, view.cursor);
  const events = graph.nodes.filter((n) => n.type === "event" && n.participants.includes(c.id));
  return (
    <article>
      <header>
        <h2>{c.title}</h2>
        <p className="dim">With {laneLabel(graph, lane)} at Ep {view.cursor}</p>
      </header>
      <section>
        <h3>Goals now</h3>
        {activeGoals(graph, c.id, view.cursor).map((g) => <p key={g.text}>{g.text}</p>)}
        {activeGoals(graph, c.id, view.cursor).length === 0 && <p className="dim">Nothing stated yet.</p>}
      </section>
      <section>
        <h3>Route</h3>
        <ul className="why-list">{events.map((e) => <li key={e.id}><Jump g={graph} id={e.id} dispatch={dispatch} /></li>)}</ul>
      </section>
      <div className="actions"><button onClick={() => dispatch({ type: "select_char", id: null })}>Stop following</button></div>
    </article>
  );
}

export function HintPanel({ lens }: { lens: ViewState["lens"] }) {
  const text = lens === "why" ? "Tap any event to trace its root causes and what it led to." : "Tap an event to see what happened and why. Drag the ribbon, or use the slider, to move through episodes.";
  return <p className="hint">{text}</p>;
}
