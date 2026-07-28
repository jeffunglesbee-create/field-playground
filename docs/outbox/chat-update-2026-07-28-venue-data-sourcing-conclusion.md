# chat-update-2026-07-28-venue-data-sourcing-conclusion

**From:** chat (claude.ai)
**Closes:** the "can external sources replace the hand-maintained venue table" thread
**Status:** answered, with one flaw in my own probe flagged below

---

## The answer

**Coordinates: yes, externally sourceable.** Nominatim and Photon both
returned 8/8 at metre accuracy, keyless. Wikidata 7–8/8. The 98-entry
coordinate table is regenerable rather than hand-maintained.

**Roof type: no — and not for lack of coverage.** Every structured
source returned 0/8 or 1/8. The reason is structural, established by
dumping complete unfiltered tag sets rather than guessing at keys:
OSM's `roof:shape=*` is a ~30-value catalogue of **geometric** shapes
(dome, gabled, hipped, flat). "Retractable" is a **mechanical**
property with no value in that vocabulary. That's why Tropicana Field
returns `dome` from two independent infrastructures while both
retractable venues return nothing at all.

**Roof type from Wikipedia prose: 82/98**, reading only the lead
sentence — Wikipedia's Manual of Style requires the first sentence to
define what the subject *is*, in present tense.

---

## A flaw I introduced, and it produces false positives

The probe reports three "our table's name is wrong" hits:

```
Angels Stadium    -> matched via "Angel Stadium"
Toyota Stadium    -> matched via "Toyota Field"
Riverside Stadium -> matched via "Riverside Field"
```

**Only the first is credibly a typo.** My variant generator swaps
`Stadium` ↔ `Field` blindly — but **Toyota Stadium** (Frisco, TX) and
**Toyota Field** (San Antonio) are two different real venues, as are
**Riverside Stadium** (Middlesbrough) and any "Riverside Field". So
those two "matches" may have resolved a *different stadium entirely*
and scored it as correct.

Both happen to be `open`, which is the majority class, so a wrong match
still lands on the right answer — the score is right by luck, not by
correctness. That's worse than a visible failure.

**Do not trust the variant-matched rows without checking each one.** The
fix is to verify the resolved article's coordinates against the table's
own lat/lon before accepting a variant match — the data to do that is
already in the same file.

---

## The two genuine disagreements

```
BC Place       — "BC Place is a multi-purpose stadium in Vancouver..."
Marvel Stadium — "Docklands Stadium is a stadium located in ... Docklands."
```

Both are retractable; neither lead sentence mentions a roof. Marvel
Stadium also resolves to its former name. These aren't parsing bugs —
they're articles whose first sentence simply omits the fact. That is the
heuristic's real ceiling, and it can't be regexed away.

---

## Recommended shape

Two different reliability needs, two different mechanisms:

| Field | Source | When |
|---|---|---|
| `lat`/`lon` | Nominatim | runtime, cached 30d per its usage policy |
| `roofType` | Wikipedia lead sentence | **generated once in CI, human-reviewed, frozen** |

82/98 is far too weak for a live lookup and entirely adequate for a
generator whose output a person reads before it lands. A reviewer
catches BC Place immediately; a runtime heuristic silently shows weather
for an indoor game.

---

## Also found

`Angels Stadium` in `src/data/weather.js` should almost certainly be
`Angel Stadium` (singular). If the relay ever emits that string, the
weather lookup finds nothing — silently. Same failure class as the dome
and coordinate bugs found earlier: renders fine, wrong underneath.

---

## Method note

Nine rounds on the POI sources, three on Wikipedia. The conclusions that
survived were the ones where a round *stopped guessing at keys and
dumped everything* — the complete tag set, the full variant list, the
raw lead sentence. Every conclusion reached by inference in this thread
was later overturned, including three of mine.
