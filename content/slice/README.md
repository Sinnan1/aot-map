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

Because `bio`/`tags`/`aliases` cannot ship, **alias search is not wired up**: `searchGated` matches `title`
and `summary` only. Making aliases searchable needs a per-alias gate (`character_aliases(node_id, alias,
from_ep)`), since "Founding Titan" is safe at 79 and not at 1. Until then a flat `aliases` match would let a
viewer at ep 1 search their way to the ending.
