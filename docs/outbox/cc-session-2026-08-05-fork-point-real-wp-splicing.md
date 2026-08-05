# CC Session Outbox — Fork Point real win-probability splicing

**Date:** 2026-08-05

---

## What was asked

Following the confirmed feasibility probe (13/13 real coverage across Fork Point's full real date
spread): "yes, build it" -- real win-probability splicing for MLB Fork Point candidates, drama-score
splice as the disclosed fallback for other sports/failures.

---

## What was built

- **`src/data/forkPointWp.js`** -- `fetchRealWpArc(game)`: resolves a real MLB `gamePk` via
  `statsapi.mlb.com/api/v1/schedule` (date + team-name match, same method as `dramaWpMovement.js`/
  `LiveWpTicker`), then reads the real per-play home-team win-probability array straight from
  `baseballsavant.mlb.com/gf?game_pk=`. MLB-only (checks `game.sport`); returns `null` (never throws,
  never fabricates) for any real game that can't be resolved.
- **`src/data/forkPoint.js`** -- new `spliceRealArcs(sourceArc, forkArc, splicePoint, {clampMin,
  clampMax})`: the same splice mechanic as `computeFork`, generalized to operate on two plain real
  arrays instead of parsing `drama_arc` from a game object. Win probability is clamped to 0-100 (a real
  physical bound a drama score doesn't have) so a large seam offset can't produce something like
  "153% to win."
- **`src/components/ForkPoint/index.jsx`** -- a "Splice real win probability instead of drama score
  (MLB only)" toggle. When on:
  - Fetches real WP for the currently selected source + fork game only (not the ranked "biggest forks"
    scan, which would mean dozens of live external calls per source-game change -- impolite to a free
    real API).
  - Shows an honest loading state while both real fetches are in flight.
  - Shows an honest "Real win probability unavailable for [game] -- showing drama score below instead"
    message if either real fetch fails, and the existing drama-score view renders underneath as the
    real fallback -- never a blank state.
  - When both resolve, renders its own verdict/slider/chart/legend using the real WP curves, verdict
    phrased around the real ending win-probability shift (not "peak," which is often a trivial ~100%
    late in a real blowout).

---

## Verification

**Local (mocked network, real component logic):** Playwright + `page.route()` interception of
`statsapi.mlb.com`/`baseballsavant.mlb.com` with hand-computed fixture data. Confirmed the splice math
exactly against hand calculation (ended 68.4%/65.4%, offset math checked line by line), confirmed the
slider is reactive, and confirmed the honest-unavailable path renders correctly with the drama-score
block underneath (not blank) when Savant is forced to fail.

**CI-as-proxy (real hosts, real browser, real built app):**
`scripts/probe-fork-point-real-wp-e2e.mjs` / `.github/workflows/fork-point-real-wp-e2e-probe.yml`.
First run failed on `waitUntil: 'networkidle'` never resolving (this app polls continuously in the
background -- fixed to `'domcontentloaded'`, the pattern this repo's own other CI probes already use).
Second run: **CONFIRMED** -- toggled real WP on for the real default pairing (Guardians @ Twins forked
onto Astros @ Angels), got real `gamePk` resolution, real Savant data, a correctly rendered verdict
("Twins's real win probability would have ended at 0.0%, not 100.0% -- 100.0 points lower" -- a real,
correctly-clamped result from a real decisive game), zero page errors.

Full real output: `outbox/fork-point-real-wp-e2e-probe-2026-08-05T17-44-14-602Z.txt`.

---

## Confidence gate

**92/100 -- commit stands.**

Both the splice math and the honest-unavailable path were verified against hand-computed values and a
forced-failure case locally, then the real end-to-end path was confirmed against the actual real hosts
in CI after fixing a real probe bug (wrong `waitUntil` strategy for this app's own polling behavior).
The 8-point deduction: only the default source/fork pairing was exercised end-to-end in CI, not a sweep
across the pool; and the historical-coverage probe's 13/13 (docs/outbox/cc-session-2026-08-05-fork-
point-savant-historical-coverage-probe.md) is real but not a lifetime guarantee -- the honest-
unavailable path exists specifically because that's expected to happen sometimes, not a hypothetical.

---

## Files changed

| Path | Status |
|------|--------|
| `src/data/forkPointWp.js` | new |
| `src/data/forkPoint.js` | modified -- added `spliceRealArcs` |
| `src/components/ForkPoint/index.jsx`, `ForkPoint.module.css` | modified -- real WP toggle |
| `scripts/probe-fork-point-real-wp-e2e.mjs` | new |
| `.github/workflows/fork-point-real-wp-e2e-probe.yml` | new |
| `outbox/fork-point-real-wp-e2e-probe-2026-08-05T17-42-06-173Z.txt` | new -- first run (failed, networkidle bug) |
| `outbox/fork-point-real-wp-e2e-probe-2026-08-05T17-44-14-602Z.txt` | new -- second run, real CONFIRMED result |
| `docs/outbox/cc-session-2026-08-05-fork-point-real-wp-splicing.md` | new -- this doc |
