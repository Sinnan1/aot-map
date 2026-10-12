# Researcher brief: events, edges, knowledge states

The last drop was `nodes.json` + `aliases.json`. This one is the graph itself — and it is where
the authoring rules start to bite, because edges and knowledge states are **relations**, not entities.

Three JSON files. One array per file. No pipe-delimited strings, no comments, no trailing commas.
Every rule below is enforced by `npm run content:lint`, and the executable half of this document
is `tests/researcher-contracts.test.ts` — if a rule here ever disagrees with that test, one of
the two is wrong.

## Before you start

`content/episodes.csv` is the numbering authority: 89 rows, `episode_abs` 1–89. Every `watch_ep`
you write **must be an `episode_abs` from that file**. The seeder refuses to run otherwise
(`EPISODE_UNCOVERED`). Do not invent numbers for splits or specials. The finale is **89**.

`npm run content:lint` lints the whole content directory and refuses to seed on errors. Run it.

---

## 1. `edges.json`

```json
{
  "id": "edge_basement_to_marley",
  "from": "evt_basement_reveal",
  "to": "evt_attack_on_marley",
  "type": "causes",
  "watch_ep": 60,
  "confidence": "shown",
  "why_text": "Learning the world is huge makes Eren realize Paradis is in danger."
}
```

| field | rule |
|---|---|
| `id` | `^edge_[a-z0-9_]+$`, globally unique |
| `from` / `to` | `evt_` ids that already exist in `events.json`. **Never a `char_` id.** |
| `type` | `causes` \| `alliance` \| `secret` — **lowercase**. `CAUSES` fails validation. |
| `watch_ep` | must be **≥ the `watch_ep` of both endpoints** |
| `confidence` | `shown` \| `implied` \| `interpretation`. Required. |
| `why_text` | required, non-empty, **exactly one sentence** |

**`causes` is always forward in time.** The cause opens before or at the effect. An edge whose
source is later than its target is a backwards causal claim and fails `GATE_ORDER`.

**Don't force an edge early.** If an edge lands more than 10 episodes after its later endpoint,
`STALE_EDGE` warns — but that is a warning, not an error. A relationship may legitimately only
become meaningful much later (Reiner's split persona runs 17 → 84). Two visible nodes sitting
apart with no line reads as broken, so keep traces tight, but a late gate is sometimes correct.

---

## 2. `knowledge_states.json`

```json
{
  "holder": "char_armin",
  "fact": "fact_rumbling_exists",
  "state": "not_knows",
  "from_ep": 60,
  "to_ep": 80,
  "confidence": "shown"
}
```

| field | rule |
|---|---|
| `holder` | a `char_` id **or** a lane id from `lanes.json`. Nothing else. |
| `fact` | a `fact_` id from `facts.json`. **Not an event id.** |
| `state` | `knows` \| `not_knows` \| `believes_falsely` \| `hides` — **lowercase**. |
| `from_ep` | when the state begins. ≥ the fact's `revealed_ep` **and** ≥ the holder's gate. |
| `to_ep` | when it stops, or `null` if it still holds. Strictly greater than `from_ep`. |
| `confidence` | as above. Required. |

Ranges are **half-open**: a state holds for `from_ep <= ep < to_ep`. Two states for the same
`holder` + `fact` may not overlap (`STATE_OVERLAP`).

**The four states are not a truth table.** "Reiner lies to Eren" is *two rows*:

```
{ holder: "char_reiner", fact: "fact_...", state: "hides",     from_ep: 31, to_ep: null }
{ holder: "char_eren",  fact: "fact_...", state: "not_knows", from_ep: 17, to_ep: null }
```

The subject of a knowledge state is the **fact**, not the event where it surfaces. If the thing
being known is not a `fact_` yet, add it to `facts.json` first with its `revealed_ep`.

---

## 3. `events.json`

```json
{
  "id": "evt_attack_on_marley",
  "type": "event",
  "title": "The Sky Fills",
  "faction_lane": "paradis_island",
  "watch_ep": 60,
  "story_order": null,
  "is_flashback": false,
  "happened_in": null,
  "confidence": "shown",
  "depth_layer": "surface",
  "tier": 1,
  "summary": "Marley's airships descend on Shiganshina and the island's last defence breaks.",
  "because": "Paradis learns it is not the only people left.",
  "setup_ref": "evt_basement_reveal",
  "void_pos": null,
  "participants": ["char_eren", "char_reiner"]
}
```

| field | rule |
|---|---|
| `id` | `^evt_[a-z0-9_]+$`, unique |
| `title` | **names the action, never the secret.** See below — this is the most common rejection. |
| `faction_lane` | a lane id from `lanes.json`, unlocking at or before this `watch_ep` |
| `watch_ep` | when the event becomes **knowable**, not when the scene plays |
| `story_order` | integer or `null`. Rewatch only; never sent to the client. |
| `is_flashback` | true → `happened_in` required. false → `happened_in` must be `null`. |
| `depth_layer` | `surface` \| `paths`. A `paths` node **must** have `void_pos` `{x,y,z}`. |
| `tier` | `1` primary, `2`/`3` clustered first. **Events only.** >4 tier-1 in one episode warns. |
| `summary` | required, non-empty, one sentence |
| `because` | one sentence, or `null` for a root. **If set, it needs at least one `causes` edge into this event** visible by this `watch_ep` (`BECAUSE_UNBACKED`). |
| `setup_ref` | an `evt_` id or `null`, never later than `watch_ep` |
| `participants` | `char_` ids, each gated at or before this `watch_ep` |

`importance` (`core` \| `major` \| `minor`) belongs to **characters**, not events. Events use `tier`.

---

## Two copy rules

### `TITLE_LEAK` — titles name the mystery, not the answer

Titles always render on the canvas, so they obey the strictest rule: a title may only use terms
already known **at that episode**. "The Sky Fills", not "The Rumbling". "The Basement", not
"The World Beyond the Walls".

A title is checked against the **latest** gate of every term in the vocabulary — node titles,
lane labels, aliases, `terms.json`. Prose is checked against the **earliest**. Both directions
exist deliberately, so a node cannot launder its own secret by being its first mention.

Checked: `title`, `summary`, `because`, `happened_in`, edge `why_text`, fact `text`, goal `text`.

Aliases are gated per name in `aliases.json`, so "Founding Titan" is not vocabulary until ep 80
even though Eren's node is visible from ep 1.

### `ALIAS_BEFORE_NODE` — a name can't predate its character

`from_ep` may never be earlier than its node's `watch_ep`. Rows are keyed on `(node_id, alias)`,
never the name alone: "Jaw Titan" is held by Ymir from 31, Falco from 78 and Porco from 78.

---

## The S4 → S1 promise

The product goal is that a viewer at, say, Episode 65 can trace a confusing Season 4 event back
to a minor Season 1 detail in a few hops.

Your job isn't just to make every event causally traceable — it's to keep the trace **short**. If
the honest path from a Season 4 event back to early material runs through six intermediate nodes,
add a **stepping-stone event** rather than linking directly across the gap. A depth histogram will
be reported once your edges land; it is how we find the places that need stones.

---

## Quick checklist

- [ ] Every `watch_ep` exists in `episodes.csv` (1–89)
- [ ] Every `type` / `state` / `confidence` is **lowercase**
- [ ] Every edge endpoint is an `evt_` that exists
- [ ] Every `fact` is a `fact_` that exists in `facts.json`
- [ ] Every edge `watch_ep` ≥ both endpoints
- [ ] Every `why_text`, `summary`, `because` is exactly one sentence
- [ ] Every non-null `because` has a `causes` edge into it
- [ ] No title names something not yet known
- [ ] No alias `from_ep` precedes its node's `watch_ep`
- [ ] `npm run content:lint` → 0 errors

## Still needs a second reviewer

These are drafts read off the arcs, not verified frame by frame:

- **17 character `watch_ep` values** in `nodes.json` — most run later than the source data's
  `first_appears_ep`, because that column means "on screen" and `watch_ep` means "named".
- **12 inferred alias `from_ep` values** in `aliases.json` — listed at the bottom of
  `content/slice/README.md`. The other 30 either mirror their node's gate or land on a plainly
  spoken line.