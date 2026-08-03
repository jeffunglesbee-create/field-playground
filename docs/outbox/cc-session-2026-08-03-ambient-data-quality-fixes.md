# CC Session Outbox — two real bugs found reviewing my own probes

**Date:** 2026-08-03

---

## What was asked

A parallel session reviewed the two probes from the prior round
(`probe-ambient-multiday.mjs`, `probe-sport-of-week-shape.mjs`) and
found two real data-quality issues neither probe's own pass/fail
verdict flagged — both verdicts only checked whether values resolved
and varied, not whether they were valid. User asked whether this
affects what was just shipped (`AmbientWeek`, the `sport_of_week` fix).

**It did, directly** — both issues are on the exact same real payload
`AmbientPanel`/`AmbientWeek` render.

---

## What was found

Ran a follow-up probe (`scripts/probe-ambient-data-quality.mjs`)
dumping full raw shapes for the anomalous dates rather than guessing:

**1. `night_stars.starScore` is not bounded to 10.** Reverse-engineered
the real formula from 4 real samples, all matching exactly:
`starScore = dramaGames + closeGames * 0.5`, uncapped. A big slate with
several close games pushes it past 10 — 17, 12, and 10.5 all seen on
real dates. `AmbientPanel`'s pre-existing `SlateVerdict` already
labeled this "X / 10", a false claim; my own `AmbientWeek` (shipped
last round) inherited the same false label and made the anomaly more
visible (an inline "17.0/10" in a "best night" summary line, not just
a hover tooltip). `stars` (the separate 1-5 field behind the ★ icons)
was 5 in every sample checked, not proven bounded beyond that — the
render is defensively clamped either way.

**2. `sport_of_week`'s real bug is worse than initially estimated.**
The endpoint's own precomputed `winner`/`summary`/`dramaTotal` are
built from `allSports` entries split across multiple un-normalized
casings for the same sport ("MLB"/"mlb"/"Baseball (MLB)", same pattern
for MLS/WNBA/PGA Tour). Re-aggregating today's real captured payload by
hand first suggested only the totals were undercounted; **running the
actual correction code** (not trusting hand arithmetic) found the real
runner-up changes too — the backend states "MLB (141/171) edged WNBA
(19/19)," but MLS's real combined total across its three casings
(35/39) is actually higher than WNBA's (25). The real, corrected
sentence is "MLB (171/202 high-quality) edged MLS (35/39)." Today's
winner (MLB) still happens to be correct either way, but the stated
numbers and runner-up were both genuinely wrong.

---

## What was built

- `src/data/sportOfWeek.js` — `recomputeSportOfWeek(raw)`: re-aggregates
  the real `allSports` array by an explicit, verbatim alias table
  (every real variant seen across two real dates this session, matching
  `Arbitrage`'s own established precedent for real-not-guessed service
  aliasing) and recomputes winner/runnerUp/summary from the corrected
  totals. Doesn't invent any data — only correctly combines what the
  endpoint already sent split across casings. Null/no-`allSports`
  inputs pass through unchanged.
- `AmbientPanel`'s `SportOfWeekBanner` now routes through
  `recomputeSportOfWeek` before rendering.
- `AmbientPanel`'s `SlateVerdict` and `AmbientWeek` both drop the false
  "/10" claim, showing `starScore` honestly as "drama intensity N"
  instead of clamping it (clamping would lose real information about
  how dramatic a night was). The ★ render is defensively
  `Math.min(5, stars)`-clamped as a display safeguard, same posture as
  `DeskCard`'s existing input clamp.

---

## Verified

- `npm run build` — clean (187 modules).
- All three automated guards — clean.
- Unit-checked `recomputeSportOfWeek` directly against the exact real
  payload captured earlier (`outbox/sport-of-week-shape-probe-2026-08-
  03T18-07-46-260Z.txt`): corrected MLB total 171 (141+18+12, exact),
  corrected runner-up MLS 35/39 (not the hand-estimated WNBA) — this
  discrepancy from my own by-hand estimate is exactly why the code was
  run rather than trusted on arithmetic alone. Null and no-`allSports`
  inputs confirmed to pass through without crashing.
- Local browser verification (Playwright, the exact real captured
  `sport_of_week` payload mocked): corrected summary text ("171/202 ...
  MLS (35/39)") renders; the stale backend text ("141/171") does not;
  the "drama intensity 17" title attribute confirmed directly (not
  visible via `innerText()`, since it's a hover attribute — checked via
  `getAttribute`, not text matching); `AmbientWeek`'s best-night line
  uses the same honest label, no `/10` claim.

---

## Files changed

| Path | Status |
|------|--------|
| `scripts/probe-ambient-data-quality.mjs`, `.github/workflows/ambient-data-quality-probe.yml` | new — raw-shape confirmation for both bugs |
| `outbox/ambient-data-quality-probe-*.txt` | new — real probe result |
| `src/data/sportOfWeek.js` | new — real re-aggregation fix |
| `src/components/AmbientPanel/index.jsx` | modified — both fixes applied |
| `src/components/AmbientWeek/index.jsx` | modified — starScore label fix |
| `docs/outbox/cc-session-2026-08-03-ambient-data-quality-fixes.md` | new — this doc |
