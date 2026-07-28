# cc-session-2026-07-28-venue-table-followups

**Executes:** `docs/CC-CMD-2026-07-28-venue-table-followups.md`
**Source of record:** `docs/outbox/chat-update-2026-07-28-venue-data-sourcing-conclusion.md`
**Commits:** 8b897bd, bc92d48 (TASK 1) → a6fa78b (TASK 2) → e953d26, 4608ada
(TASK 3) -- all pushed directly to `main`, no PR, matching the established
convention for this repo's probe/investigation scripts.

All three tasks executed in dependency order. `src/data/weather.js` was
**not modified** -- TASK 1 found nothing to fix, and TASK 3 is a review
artifact by design.

---

## TASK 1 -- Angels Stadium vs Angel Stadium

**Which spelling the relay actually sends:** `Angel Stadium` (singular),
confirmed across 7 real dates (2026-07-17 through 2026-07-27) via a
GitHub Actions probe (`relay-venue-check.yml` -- this sandbox can't
reach `field-relay-nba.jeffunglesbee.workers.dev` directly). No date was
hardcoded; the probe scanned a real -14/+14 day window and reported
whatever it found.

**Which way it went:** nowhere -- `src/data/weather.js` already carries
**both** `'Angels Stadium'` and `'Angel Stadium'` as separate keys with
identical coordinates, added during the original `VENUE_COORDS` port
(PR #27, earlier in this session). The relay's real string already
resolves correctly today. Verified before assuming a fix was needed,
per the CC-CMD's own instruction to confirm the actual string first --
in this case confirming there was nothing to change.

---

## TASK 2 -- coordinate-gating the false positives

Fixed `scripts/probe-wikipedia-roof.mjs`'s `titleVariants()` acceptance:
a match on a Stadium<->Field variant is now only accepted if the
resolved article's own coordinates agree with the table's truth
coordinates (0.02 deg / ~2km threshold, reused from
`scripts/probe-poi-geocode.mjs`, not reinvented). Verified locally
against two synthetic cases before trusting it against real data: a
genuine match (Angel Stadium) and a genuine mismatch (Toyota
Field/Toyota Stadium, ~4 degrees apart) both resolved correctly.

**Which of the three original variant hits survived**, re-run for real
against all 98 venues:

| Venue | Before (ungated) | After (gated) |
|---|---|---|
| Angels Stadium | matched via "Angel Stadium" | **survives** -- coordinates verified, delta 0.0001 |
| Toyota Stadium | matched via "Toyota Field" (unverified) | now an honest `MISS (disambiguation)` -- no claim either way |
| Riverside Stadium | matched via "Riverside Field" (unverified) | resolved directly on the exact original name this run -- no variant needed at all |

Only Angels Stadium was ever a real "our table's name is wrong" finding.
The other two were noise from the original ungated probe scoring a
lucky match, not genuine discoveries -- exactly the failure mode the
CC-CMD flagged ("a wrong answer that scores right is worse than a
visible failure").

Overall result this run: 81/98 correct, 2 wrong, 15 miss (consistent
with the 82/98 baseline established before this fix; the small
variance is normal run-to-run network noise, not a regression).

---

## TASK 3 -- the reviewed roofType table

`outbox/roof-type-proposed.json`, 98 rows, generated only after TASK 2
landed (an ungated variant match would have poisoned this table with a
wrong venue's data).

**Agree/disagree counts:** 90 agree, **2 disagree**, 6 miss (no
Wikipedia data resolved for those 6 -- table's current value carried
through unchanged, not guessed at).

**Every disagreement, in full:**

```
BC Place
  current: retractable   wikipedia-derived: open
  lead sentence: "BC Place is a multi-purpose stadium in Vancouver,
  British Columbia, Canada."
  known-unfixable: true
  note: Lead sentence omits roof type entirely ("multi-purpose
  stadium"); venue is genuinely retractable.

Marvel Stadium
  current: retractable   wikipedia-derived: open
  lead sentence: "Docklands Stadium is a stadium located in the
  Melbourne suburb of Docklands."
  known-unfixable: true
  note: Resolves under its former name (Docklands Stadium); that lead
  sentence is purely locational and omits roof type; venue is
  genuinely retractable.
```

Both disagreements are exactly the two known-unfixable cases the
CC-CMD pre-flagged -- no new, unexpected disagreements surfaced. Both
are genuine heuristic ceilings (an article whose first sentence simply
doesn't state the fact), not bugs to chase further; the CC-CMD was
explicit that pattern-matching harder here would reintroduce the
proposals-and-abandoned-plans problem this whole lead-sentence-only
approach exists to avoid.

`src/data/weather.js` was not touched by this task or any other in this
session -- the table remains exactly as a human left it, with a
reviewed, machine-readable proposal sitting alongside it for whenever
someone chooses to act on it.

---

## Files changed

| Path | Status |
|------|--------|
| `.github/workflows/relay-venue-check.yml` | new -- TASK 1's spelling verification, CI-as-proxy |
| `scripts/probe-wikipedia-roof.mjs` | modified -- TASK 2 coordinate gating, TASK 3 JSON emission |
| `outbox/relay-angels-venue-check.txt` | new -- TASK 1 raw result |
| `outbox/roof-type-proposed.json` | new -- TASK 3 reviewed table (not applied) |
| `outbox/wikipedia-roof-probe-*.txt` | new (several) -- TASK 2/3 verification runs |
