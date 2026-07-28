# CC-CMD-2026-07-28-venue-table-followups

**Repo:** field-playground
**Branch:** main — commit directly, do not create a feature branch or PR
**Scope:** three follow-ups from the venue data sourcing investigation.
**Source of record:** `docs/outbox/chat-update-2026-07-28-venue-data-sourcing-conclusion.md`

Ordered by dependency. TASK 2 must land before TASK 3 is trustworthy.

---

## TASK 1 — fix a silent lookup failure (smallest, highest certainty)

`src/data/weather.js` has `'Angels Stadium'`. The venue is
**`Angel Stadium`** (singular). Wikipedia 404s on the plural; the
singular resolves.

Consequence today: if the relay emits `Angel Stadium`, `getVenueCoords`
finds nothing and the weather panel renders empty — no error, no
console message. Same silent-miss class as the dome-flagged-outdoor and
10-mile-coordinate bugs already fixed in this file.

**Before changing it, confirm which string the relay actually sends** —
that is the string the lookup must match, and it is the only thing that
decides the correct spelling:

```
curl -s "https://field-relay-nba.jeffunglesbee.workers.dev/context/date/{a date with an Angels home game}" \
  | grep -o '"venue":"[^"]*"' | sort -u
```

If the relay says `Angel Stadium`, fix the table. If it says
`Angels Stadium`, the table is right and **Wikipedia is the one that
needs an alias** — do not "fix" a correct entry to match an external
source. Record which way it went.

---

## TASK 2 — remove a false positive I built into the probe

`scripts/probe-wikipedia-roof.mjs`'s `titleVariants()` swaps
`Stadium` ↔ `Field` blindly. That is unsound: **Toyota Stadium**
(Frisco, TX) and **Toyota Field** (San Antonio) are different real
venues, as are **Riverside Stadium** (Middlesbrough) and any
"Riverside Field".

The probe reported both as "OUR TABLE'S NAME IS WRONG". They may
instead be *correct table entries matched against the wrong article*.
Both are `open` — the majority class — so a wrong match still scores
correct. **A wrong answer that scores right is worse than a visible
failure**, and it is currently in the results.

**Fix:** accept a variant match only if the resolved article's
coordinates agree with the table's own lat/lon for that venue. The
comparison data is already in the same file. Reuse the 0.02° threshold
(~2km) from `scripts/probe-poi-geocode.mjs` — it is the same question
that probe already answered, so do not invent a second threshold.

Wikipedia's summary endpoint returns `coordinates: {lat, lon}` on most
articles. Where it does not, **reject the variant** rather than
accepting it unverified.

Re-run afterwards and report which of the three variant hits survive.
Expect `Angel Stadium` to survive and be genuinely unsure about the
other two — that uncertainty is the point of the task.

---

## TASK 3 — generate the reviewed roofType table

Only after TASK 2, because ungated variant matches would poison it.

Emit `outbox/roof-type-proposed.json` — every venue, its current
`roofType`, the Wikipedia-derived value, the lead sentence used, and
whether they agree. **Do not modify `weather.js`.** The whole value of
this approach is that a human reads the diff before it lands; a
generator that writes directly is just a runtime heuristic with extra
steps.

Two known-unfixable rows, already established — include them, flagged:

- **BC Place** — *"BC Place is a multi-purpose stadium in Vancouver..."*
  Retractable; lead sentence omits the roof entirely.
- **Marvel Stadium** — resolves under its former name, Docklands
  Stadium; same omission.

These are the heuristic's real ceiling, not bugs. Anything claiming to
fix them by pattern-matching harder is reading past the lead sentence,
which reintroduces the proposals-and-abandoned-plans problem this whole
approach exists to avoid.

---

## Explicitly NOT in scope

- **No runtime Wikipedia calls.** 82/98 is fine for a reviewed
  generator and not remotely fine for a live lookup.
- **No coordinate migration.** Nominatim scored 8/8 and the table is
  regenerable, but swapping a working hand-verified table for a live
  dependency is a separate decision with its own risk.
- **No new roof source hunt.** Twelve rounds established the reason is
  schema, not coverage: OSM's `roof:shape` is a geometric catalogue with
  no mechanical value for "retractable". Another source will not have it
  either unless it models the concept.

---

## Outbox

`outbox/cc-session-2026-07-28-venue-table-followups.md`: which spelling
the relay actually uses and which way TASK 1 went; which variant hits
survived coordinate gating in TASK 2; and the agree/disagree counts from
TASK 3 with every disagreement quoted in full.
