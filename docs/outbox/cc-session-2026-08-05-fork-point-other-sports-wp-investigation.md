# CC Session Outbox — Fork Point other-sports real-WP investigation

**Date:** 2026-08-05

---

## What was asked

"Wire it into the other sports if a real source ever exists." Fork Point's real-WP mode (Baseball
Savant) is MLB-only. Before writing any code, investigate whether this repo has already confirmed a real
per-play/per-possession win-probability-equivalent source for any other sport it deals with -- and only
wire one in if a real, already-verified source actually exists.

---

## What was investigated

A dedicated research pass across `docs/REAL-API-SURFACE.md`, every `src/data/*.js` real-data module, and
`docs/outbox/*.md`, checking each sport this repo already touches for a real, already-confirmed
per-play/per-possession WP-equivalent source (the same bar Baseball Savant was held to before
`forkPointWp.js` existed):

- **MLS** -- only `/mls/stats/.../standings` is confirmed real (standings only, 🟡 in REAL-API-SURFACE.md).
  No per-possession data of any kind. The 2026-08-05 coverage probe doc already states this plainly:
  "MLS/WNBA candidates in the same pool would stay on the current `drama_arc` splice, disclosed rather
  than silently mismatched."
- **WNBA** -- same conclusion, no WNBA-specific real data module exists anywhere in `src/data/`.
- **NBA / NHL** -- no file, doc, or probe in this repo mentions a real per-possession/per-play WP source
  for either. No section for either sport exists in `REAL-API-SURFACE.md` beyond the generic
  `drama_arc` leaderboard.
- **Soccer/football (BSD, LaLiga APIM, football-data.org, ESPN/FPL)** -- BSD's real, confirmed
  `/bsd/events/{id}/shotmap` fields are `expected_goals`, `shotmap`, `momentum`, `average_positions`,
  `xg_per_minute` -- real, but none is a win-probability value. LaLiga APIM's eight confirmed real
  routes are standings/media/rankings, no WP field. football-data.org has only ever been queried for
  standings. ESPN/FPL's EPL viability probe confirmed schema shape only, during a pre-season window
  with zero played matches -- no live per-play data of any kind was ever populated or checked.

A repo-wide grep for `winProbability|win_prob|wpa|WPA` in `src/` returns only MLB-only real-data modules
(`forkPointWp.js`, `dramaWpMovement.js`, both explicitly commented "MLB ONLY"), the client-side estimator
`wpEstimator.js` (fitted and validated against MLB only, not an external source), and UI components that
only ever render Savant's or the estimator's output.

---

## Result

**No real per-play/per-possession win-probability-equivalent source exists anywhere in this repo's
confirmed history for MLS, WNBA, NBA, NHL, or soccer/football generally.** This isn't a gap that was
simply never asked about -- MLS/WNBA were already explicitly ruled out in the coverage-probe doc, and the
soccer-adjacent sources (BSD, LaLiga, football-data.org, ESPN/FPL) have all been independently probed for
other purposes and never turned up a WP field.

---

## What was built instead

Since no real source exists to wire in today, **`src/data/forkPointWp.js` was refactored into a
per-sport provider registry** (`WP_PROVIDERS`) so a future real source plugs in cleanly without touching
`fetchRealWpArc` or any caller:

```js
const WP_PROVIDERS = {
  MLB: fetchMlbSavantWpArc,
}
```

`fetchRealWpArc(game)` now dispatches on `game.sport` against this registry instead of a hardcoded
`if (game.sport !== 'MLB') return null` check. Functionally identical for MLB today (verified -- see
below); the difference is entirely structural: adding a real source for another sport later means adding
one entry with the same `(game) => Promise<number[] | null>` shape, at the same real-source bar MLB was
held to (an independently confirmed live probe, not "this API probably has a WP field").

---

## Verification

Production build clean. Local Playwright regression check (mocked `statsapi.mlb.com`/
`baseballsavant.mlb.com`, same fixtures used to verify the original feature) confirmed byte-identical
output before and after the refactor -- "Baltimore Orioles's real win probability would have ended at
65.4%, not 68.4% -- 3.0 points lower," zero page errors. No CI-as-proxy re-run needed: this is a pure
internal restructuring with no change to the real network calls, real fields read, or real splice logic
already confirmed working end-to-end (docs/outbox/cc-session-2026-08-05-fork-point-real-wp-splicing.md,
cc-session-2026-08-05-fork-point-real-wp-sweep.md).

---

## Confidence gate

**96/100 -- commit stands.**

The investigation is thorough and the negative result (no other real source exists) is well-grounded in
this repo's own prior probes, not an assumption. The refactor is small, mechanically verified
byte-identical to the pre-refactor behavior via a real regression check. The 4-point deduction: the
investigation was a repo-search, not a fresh network probe against any of the other sports' real hosts
directly from this session (e.g., re-confirming BSD's shotmap response has no WP-adjacent field by
re-fetching it, rather than trusting the prior probe's documented field list) -- a real, disclosed gap
between "grounded in this repo's own prior real findings" and "independently re-verified this session."

---

## Files changed

| Path | Status |
|------|--------|
| `src/data/forkPointWp.js` | modified -- refactored into a per-sport provider registry, MLB behavior unchanged |
| `docs/outbox/cc-session-2026-08-05-fork-point-other-sports-wp-investigation.md` | new -- this doc |
