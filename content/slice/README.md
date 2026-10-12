# Sample slice content

**This is pipeline-proving sample data, not authoritative.** Episode numbers, copy, and causal links must be
verified against the show by the author and a second reviewer before anything ships.

Intentionally missing: the Yeagerists lane (add it with the `watch_ep` where the faction is first named),
Foundation nodes beyond two examples, and everything from Episodes 61-69.

Tables map 1:1 to the spec's section 7. `terms.json` is the spoiler glossary: words that are not nodes but must not
appear in copy earlier than their `watch_ep`.

## Characters

The 19 character nodes came from the batch 3A export (`id,name,aliases,short_description,...,importance,cluster_id,
icon,color,tags,first_appears_ep,source_url`). It is sample data, and it was rewritten on the way in:

- **`first_appears_ep` was discarded as a gate value.** It means "the body is on screen"; `watch_ep` means
  "safe to show this node". Historia, Zeke, Bertholdt, Grisha and Ymir all appear on screen long before the
  show names them, so ingesting the column directly would have leaked five reveals. `watch_ep` is now the
  episode the character is *named*. **These values are a first pass and need the second reviewer** —
  they were read off the episode arcs, not verified frame by frame. Bias late: a late node costs nothing,
  an early one leaks.
- **Krista Lenz was merged into Historia Reiss** as aliases. One person, one node; otherwise the Character
  lens renders two bubbles and they need a merge relation the data model has no notion of.
- **`importance` (core/major/minor) became `tier` (1/2/3)**, the scale the Rule of 7 already uses. One
  prominence scale, not two.
- **`cluster_id` became `lane_history`**, so a character can change faction (Reiner: scouts@17, warriors@31;
  Historia: scouts@30, paradis_government@40) instead of carrying one static label.
- **`long_description` became `bio`, which is server-side only.** It is written with whole-series knowledge —
  Hange's bio says he succeeds Erwin, which is an ep 54 spoiler — so it cannot ship against any gate the row
  can carry. Same for `tags` ("yeagerists" on Eren at ep 1) and `aliases` ("Founding Titan"). `short_description`
  became `summary`, which does ship, and is the only field that went through a spoiler rewrite.
- **Two lane gates moved.** `warriors` 60 -> 23 and `paradis_government` 60 -> 38, because Annie is unmasked
  at 23 and the Royal Government arc opens at 38. They were set when only Marley-era characters existed.

## Titans

The 11 Titan nodes (`titan_*`, `type: "titan"`) came from the batch 3B export (`cluster_id = titan_powers`). Like characters, they live in `nodes.json` with their reference fields (`bio`, `tags`, `icon`, `color`, `source_url`) stored server-side only, use `importance` rather than `tier`, and never enter the Rule of 7 event canvas (`placeEvents()` filters to `type === "event"`) or the character lane dots (`holdersAt()` and `Ribbon` filter to `type === "character"`):

- **Five `watch_ep` gates moved to the episode the Titan's name is actually spoken:**
  - `titan_founding`: `37 -> 43` (Ep 37 only names the "Coordinate"; "Founding Titan" and memory alteration arrive in Ep 43 *"Sin"*).
  - `titan_pure`: `1 -> 57` (mindless Titans appear in Ep 1, but the term "Pure Titan" distinguishing transformed Eldians from the Nine is introduced in Ep 57 *"That Day"*).
  - `titan_attack`: `7 -> 58` (Eren's rogue Titan appears in Ep 7, but Kruger reveals its true name in Ep 58 *"Attack Titan"*).
  - `titan_jaw`: `29 -> 60` (Ymir transforms at Utgard in Ep 29, but "Jaw Titan" is first named in the Marley premiere, Ep 60).
  - `titan_cart`: `50 -> 60` (Erwin calls it a quadrupedal type in Ep 50; "Cart Titan" is first named in Ep 60).
- **Three `short_description` (`summary`) strings were rewritten to remove later spoilers:**
  - `titan_founding` (Ep 43): removed `"Eldian"` (an Ep 57 term).
  - `titan_attack` (Ep 58): removed `"can perceive future memories"` (the Ep 79 twist).
  - `titan_wall` (Ep 25): removed `"Millions"` and `"Paradis Island"` (Ep 25 reveals a single dormant Titan face inside Wall Sina).
- **Separating Titan existence from holder identity:** `titan_colossal@1`, `titan_armored@2`, `titan_female@17`, and `titan_beast@26` establish those Titan names as safe vocabulary in `lintContent()` from their first appearance, while the human shifter aliases (`char_reiner` -> `"Armored Titan"@31`, `char_zeke` -> `"Beast Titan"@74`) stay gated at the unmasking episodes.

## Concepts

The 12 Concept nodes (`concept_*`, `type: "concept"`) came from the batch 3C export (`cluster_id` in `titan_lore` / `world_history`). They follow the same non-event node contract (`importance` instead of `tier`, server-only `bio`/`tags`/`icon`/`color`/`source_url`, excluded from the Rule of 7 event canvas and character lane dots):

- **`concept_the_rumbling` moved `58 -> 69`:** In Ep 58, Kruger only mentions flattening the earth with Wall Titans without naming "The Rumbling"; the name and deterrence plan are debated on Paradis in Ep 68–69 (*"A Sound Argument"*), and `summary` describes the threat rather than the Ep 80 execution.
- **Pre-Basement `short_description` (`summary`) rewrites:**
  - `concept_coordinate` (Ep 37): removed `"Paths"` (Ep 58) and `"Founding Titan"` (Ep 43).
  - `concept_memory_manipulation` (Ep 42): removed `"Founding Titan"` (Ep 43) and `"Subjects of Ymir"` (Ep 57).
  - `concept_titan_inheritance` (Ep 43): removed `"Nine Titan"` (Ep 57/58).
  - `concept_royal_blood` (Ep 44): removed `"Ymir Fritz"` (Ep 57).
  - `concept_vow_renouncing_war` (Ep 44): removed `"Karl Fritz"` (Ep 58/64).
- **Delayed Concept aliases:** `"Intersection of Paths"@58` on `concept_coordinate@37`, `"Fritz Bloodline"@57` on `concept_royal_blood@44`, and `"Path Realm"@78` on `concept_the_paths@58`.

## Locations

The 13 Location nodes (`location_*`, `type: "location"`) came from the geography export (`cluster_id = geography`). Like characters, Titans, and Concepts, they live in `nodes.json` with `importance` instead of `tier` and server-only `bio`/`tags`/`icon`/`color`/`source_url`:

- **Early `short_description` (`summary`) rewrites:**
  - `location_shiganshina` (Ep 1): removed `"Mikasa, and Armin"` (both names unlock at Ep 3).
  - `location_wall_maria` (Ep 1): removed `"on Paradis"` (Ep 57).
  - `location_trost_district` (Ep 2): removed `"site of humanity's first counterattack victory"` (the Trost boulder victory happens in Ep 13).
  - `location_reiss_chapel` (Ep 40): removed `"crystal cavern"` (an Ep 42 location alias).
  - `location_paradis_island` (Ep 57): replaced `"King Karl Fritz"` with `"the First King"` (Kruger names Karl Fritz in Ep 58).
- **Delayed Location alias:** `"Crystal Cavern"@42` on `location_reiss_chapel@40`.

## Character Phases (`goals.json`)

`goals.json` holds the 50 character psychological phases (`entity_states.csv`) across 13 characters — Eren (5), Armin (5), Mikasa (5), Reiner (5), Zeke (4), Historia (4), Annie (4), Grisha (4), Gabi (3), Falco (3), Pieck (3), Bertholdt (3), and Porco (2):

- **Half-open intervals (`from_ep` / `to_ep`):** Inclusive `until_ep` ranges from the CSV (`1..8`, `9..37`, etc.) are stored as half-open `[from_ep, to_ep)` intervals (`to_ep = until_ep + 1`, or `null` through Ep 89) so `activeGoals()` resolves a single phase at every episode with no gaps or overlaps (`STATE_OVERLAP`).
- **Gate alignment:** Phase 1 `from_ep` values are aligned to each character's `watch_ep` where the character unlocks inside that phase (`char_armin@3`, `char_mikasa@3`, `char_reiner@17`, `char_historia@30`, `char_gabi@63`, `char_falco@63`), while pre-reveal phases for Annie (`23`), Bertholdt (`31`), Grisha (`48`), Zeke (`74`), Pieck (`75`), and Porco (`78`) remain sealed behind each character's `watch_ep` in `loadGatedGraph()`.
- **Client vs. server-only fields:** `display_label`, `text` (`motive`), `fear`, and `belief` are spoiler-rewritten for their phase gate and shipped in `CGoal`; `secret` and `spoiler_notes` contain end-of-phase or whole-series reveals and stay server-side only in `character_goals`.

## Relationships (`relationships.json`)

`relationships.json` holds the 63 Character, Titan, Concept, Faction/Lane, and Location relationships (`rel_*`) across 17 `relationship_type` values (`INHERITS_TITAN`, `RESTRICTED_BY`, `REQUIRES`, `ENABLES`, `CONTROLS`, `USED_BY`, `USES`, `CONNECTED_THROUGH_PATHS`, `MEMBER_OF`, `LEADS`, `ENEMY_OF`, `INFILTRATES`, `OPPOSES`, `OVERTHROWS`, `REBELS_AGAINST`, `NEGOTIATES_WITH`, `ALLIED_WITH`):

- **Separate from event `edges.json`:** Event edges (`causes`, `alliance`, `secret`) connect `evt_*` nodes on the timeline ribbon, while `relationships.json` connects non-event entities (`char_*`, `titan_*`, `concept_*`, `location_*`, and faction lanes in `lanes.json`).
- **Dual-gated visibility & expiry clamping:** Each row carries `true_from_ep` (in-universe start, kept server-side), `visible_from_ep`, and `expires_ep`. `loadGatedGraph()` gates each relationship by `max(visible_from_ep, source.watch_ep, target.watch_ep)` and clamps `expires_ep > progress` to `null` so a viewer at Ep 31 does not see that Bertholdt's Colossal Titan tenure ends at Ep 55.

## Aliases

`aliases.json` holds the 293 alternative names (133 character aliases + 47 Titan aliases + 59 Concept aliases + 54 Location aliases), including English, Japanese Kanji/Katakana, and Romaji variants, one row per `(node_id, alias)`, each with its own `from_ep`.

Names are gated **independently of their node**, because the safe episode for a name is usually much later than
the episode the entity appears: Eren is visible from ep 1, but "Attack Titan" is not safe until 25 and
"Founding Titan" not until 80; the Founding Titan node is visible from ep 43, but "Progenitor Titan" is not safe until 58;
the Colossal Titan is visible from ep 1, but "God of Destruction" is not safe until 62. A flat `nodes.aliases`
array could only ever use the node's own gate, so searching "Founding Titan" at ep 1 would hand over the ending.

Rows are keyed on the pair, never the name alone. "Jaw Titan" is held by Ymir from 31, Falco from 78 and Porco
from 78; "Colossal Titan" by Bertholdt from 31 and Armin from 55. A per-name value would give Falco Ymir's
episode. `ALIAS_BEFORE_NODE` in the lint rejects any `from_ep` earlier than its node's `watch_ep`.

**The `from_ep` values are drafts** and need the same second review as `watch_ep`. They were read off the
episode arcs and biased late — a late value only hides a name temporarily, an early one leaks. 12 character aliases are inferences
rather than plainly-shown beats: `Vice Chief Reiner@84`, `Flying Titan@83`, `Commander Hange@69`,
`Queen Historia@47`, `Goddess@34`, `Lady Ymir@34`, `Dancing Titan@35`, `Krista Lenz@30`, `Christa Lenz@30`,
`Boy Wonder@74`, `Horse Face@8`, `Pock@78`.

Aliases are **server-side only**, and are reachable solely through `searchGatedAliases()`, which returns node
ids and never the matched text. They are deliberately absent from `loadGatedGraph`, because putting them in the
graph payload would reverse the invariant in `src/gate/types.ts` and break the "never sends aliases" test.
