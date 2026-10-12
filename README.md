# Attack on Titan Season 4 Map: the bones

Episode-gated interactive map from spec v1.1. This repo is the **vertical-slice skeleton**: the whole pipeline
(author -> lint -> seed -> gated query -> render) works end to end on a small sample.

## Stack, and why

| Concern | Choice | Why |
|---|---|---|
| App | Next.js (App Router) + React + TypeScript | Server components run the gate on the server, so future data never reaches the client |
| DB | PostgreSQL + Drizzle | The spec is relational (nodes, edges, facts, knowledge_states). Drizzle keeps SQL visible and typed |
| Validation | Zod | One schema for authoring files, lint, and seed |
| Canvas | Hand-rolled SVG | Rule of 7 means a handful of nodes. SVG gives hit-testing, a11y, and CSS transitions for free |
| 3D | Deferred, lazy-loaded seam | Paths only (build plan step 4). `three` is intentionally not installed yet |
| Tests | Vitest + pglite (real Postgres in-process) | Gating is tested against actual SQL, not mocks |

## Run it

```bash
npm install
npm run dev          # no DATABASE_URL = in-memory Postgres, auto-migrated and seeded from content/slice
```

With a real database:

```bash
docker compose up -d
export DATABASE_URL=postgres://aot:aot@localhost:5432/aot
npm run db:migrate
npm run db:seed-episodes    # lints content/episodes.csv, then seeds the episode spine
npm run content:seed        # lints first; refuses to seed on errors
```

Other scripts: `npm test`, `npm run typecheck`, `npm run content:lint [dir] [--strict]`,
`npm run db:check-episodes` (lint the spine without a database),
`npm run db:generate` (after editing `src/db/schema.ts`).

## Characters

Characters are `nodes` rows, not a separate table: `title` is the name, `watch_ep` is the gate, `lane_history`
is the faction path, and `importance` (`core`/`major`/`minor`) is cast prominence.

`importance` is deliberately **not** `tier`. `tier` is event-only: `placeEvents()` filters to `type === "event"`,
so characters never enter the Rule of 7 pool and cannot cannibalise a plot beat's canvas slot. Promoting a
character changes nothing about the layout — `tests/researcher-contracts.test.ts` asserts exactly that.

## Content authoring rules

The lint is the traffic controller for incoming data. Two rules exist because they correspond to two
different failure modes:

- **`TITLE_LEAK`** — titles render on the canvas at all times, so they obey the strictest rule: a title may only
  use terms already known at that episode. Checked against the **latest** gate of each term, because prose is
  checked against the **earliest** and both are needed — otherwise a node could launder its own secret by being
  its first mention.
- **`STALE_EDGE`** — an edge more than 10 episodes after its later endpoint reads as broken UI (two visible nodes,
  no line). A **warning**, not an error: a relationship may legitimately only become meaningful much later.

`content/RESEARCHER-BRIEF.md` is the contract for the relational drop (events, edges, knowledge states), with the
executable half in `tests/researcher-contracts.test.ts`. If the two ever disagree, the test is the arbiter.

**Not implemented: `ORPHANED_CONTEXT`.** As specified it cannot fire on correct data — `causes` is forward in
time, so tracing backward always reaches already-visible parents, and a cause gated later than its effect is
already a `GATE_ORDER` error. The real risk is lineage *depth*, which will be reported once real edges land.

The gate value is the episode a character is **named**, not the episode they are first on screen — those differ
for most of the cast. See `content/slice/README.md` for the full rewrite and the list of `watch_ep` values
awaiting a second reviewer.

`bio` and `tags` are stored but **never selected** into the gated payload: they are written with whole-series
knowledge (Hange's bio says he succeeds Erwin; Eren's tags say "yeagerists"), so they spoil against any gate.

Alias names live in `content/slice/aliases.json`, gated **per name** rather than per node — "Founding Titan"
belongs to a node visible from ep 1 but is not safe until 80. They are reachable only through
`searchGatedAliases()`, which returns node ids and never the matched text. They are deliberately absent from
`loadGatedGraph`; putting them in the graph payload would reverse the invariant in `src/gate/types.ts`.

The `from_ep` values are drafts, biased late, and need a second reviewer. See `content/slice/README.md` for the
12 that are inferences.

## The episode spine

`content/episodes.csv` is the numbering authority: 89 rows, `episode_abs` as the primary key.
Every `watch_ep` / `revealed_ep` / `from_ep` value elsewhere in the content is an `episode_abs`,
and `db:seed-episodes` refuses to seed if the content references an episode the spine does not
cover (`EPISODE_UNCOVERED`). There is deliberately no foreign key: gate columns are a spoiler
coordinate, not a reference.

The table is read through `loadGatedEpisodes()` in `src/gate/queries.ts`, like every other
content table. A row is withheld until the viewer reaches that episode, because the title
("Beast Titan", ep 26) and ep 89's summary are both spoilers on their own.

`lintEpisodes()` enforces the shape: `episode_abs` gapless from 1, exactly one `premiere` per
season opening it, `finale` closing its arc, `episode_in_part` counting 1..n inside each
`(season, part)` group, and partless episodes trailing a parted season (S4 runs parts 1-2 over
eps 60-87, then 88-89 sit outside the parts as the Final Chapters).

## How the spoiler gate works

1. The viewer's progress lives in an httpOnly cookie (`aot_gate`), set by `POST /api/progress`.
2. `/map` is a server component. It calls `loadGatedGraph(db, gate)` in `src/gate/queries.ts`, the **only** place content is read.
3. SQL filters every table by `watch_ep` / `revealed_ep` / `from_ep <= progress` and by confidence (theories off by default).
4. Future end-episodes are nulled **in SQL** (a state that ends at ep 72 reads "still holds" at ep 64).
5. `assemble()` drops anything pointing at something the gate removed (setup refs, participants, knowledge holders).
6. Columns are selected explicitly, so `story_order` and `aliases` can never reach the client.
7. Search (`/api/search`) uses the same gate. Lenses run client-side on the already-gated graph, so they cannot leak.

It is a spoiler guard, not a security boundary: the cookie is user-editable, which is fine because the user is the only one it protects.

## Layout

```
content/slice/        authored JSON, one file per table (spec section 7). SAMPLE DATA, see its README
content/episodes.csv  the episode spine, 89 rows, the numbering authority for every watch_ep
src/content/          zod schema, loader, lint (spoiler lint, because-needs-edge, gate order, ...)
src/db/               drizzle schema, seed, client (postgres-js or pglite)
src/gate/             gate cookie, gated queries, client-facing types
src/lib/              lenses (Who Knows What, Character, Why) and the view-state reducer
src/components/       MapApp (HUD + sheet), ribbon/ (SVG canvas, layout, Rule of 7), Panels, paths/ (3D seam)
tests/                gate (pglite), lint, lenses, reducer, layout
```

## Status against the spec

**Built:** episode gate with hard invalidation; Foundation layer; 2.5D ribbon with lane gating, scrub, zoom,
"you are here", lane hops; Rule of 7 (5 on phones) with faction clusters; Who Knows What (4 states, pattern + icon);
Character lens; Why Mode; Rule 2 fading, Rule 3 edge-layer cap, Rule 5 static HUD, Rule 6 (44px targets, reduced motion);
bottom sheet / side drawer; gated search; content lint; Paths lazy-load + fallback + FPS guard seam.

**Stubbed:** Paths 3D scene (`PathsVoid3D.tsx` has the R3F TODO), Evidence toggle button (the data path and `theories`
gate work, there is no UI control yet), Hint mode.

**Deferred per spec:** clandestine layer, War Table, Story-Order toggle, density/sympathy sliders.

## Additions beyond the spec (all marked EXT in `src/content/schema.ts`)

`lanes.watch_ep` (lane names like "Yeagerists" are spoilers too), `nodes.tier` (powers Rule of 7),
`nodes.participants` (Character lens), `nodes.aliases` and `terms.json` (spoiler lint), `goals` (node detail panel).

## Before you trust it

- `content/slice` is **sample data** to prove the pipeline. Episode numbers and copy need real authoring and a second reviewer.
- `NEXT_PUBLIC_FINALE_EP` defaults to 87. Confirm whether the "Final Chapters" specials count in your numbering.
- The UI compiles, builds, and serves correct gated HTML, but has **not been looked at in a real browser or on a phone**.
  Expect polish work on the ribbon, sheet snapping, and touch scrubbing.
- On phones, arrows whose far end is in an off-screen lane are not drawn. The sheet still lists every cause and effect.
