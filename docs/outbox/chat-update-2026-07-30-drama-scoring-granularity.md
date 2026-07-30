# chat-update-2026-07-30-drama-scoring-granularity

**From:** chat (claude.ai)
**Status:** investigation only. No production change made or recommended yet.
**Trigger:** the leaderboard endpoint's drama_peak coarseness found earlier
this session (MLB: only 2 distinct values across 50 real games; NBA: 1
across 5).

---

## Two hypotheses, both tested against real data, both failed

### Hypothesis 1: the step-function formula is the cause

`dramaScoreLive` (jubilant-bassoon/src/legacy/field.js ~L21827) builds
`base`, `timeBonus`, `sitBonus` entirely from step thresholds and flat
conditional bonuses — confirmed by direct source read. Reasonable guess:
replace steps with continuous curves, get more resolution.

**Tested with `validate_drama_scoring.py`** (attached) across 25 real
finalized MLB games (13 extra-innings, 12 regular), real ESPN
play-by-play via field-relay-nba's own `/espn-summary` proxy — same
endpoint `fetchMLBHistoricalStates` uses. Ran the exact old formula and a
continuous replacement across identical state sequences per game.

**Result: no improvement.** Old: 4 distinct peaks / 25 games (16%). New
(continuous, unrounded): also 4 distinct / 25 games (16%). Zero tier
reclassifications.

**Why:** almost every real MLB game touches a tied or one-run score at
some point across its 500-700+ plays. `base` saturates near its ceiling
for nearly every game regardless of curve shape, because taking the PEAK
(max) across the whole game collapses to "did it get close at any
point," which is true for nearly everyone. Formula smoothness doesn't
matter when the summary statistic itself discards almost all the
variation before the formula's shape can matter.

### Hypothesis 2: richer per-game data already computed, discarded before archiving

Found a second `/archive/drama` call site (~L37170) constructing
`_arcPayload = {peak, peakPeriod, sustainedMinutes, trend, classification,
samples}` — a genuinely richer object than a bare peak — and sending
`JSON.stringify(_arcPayload)` as `drama_arc`. Looked like exactly the
differentiating signal missing from the leaderboard.

**Checked against real stored data before trusting it.** Pulled three
actual archived games' `drama_arc` values directly: all three are bare
stringified arrays, `[52,52,52,...]`, matching what `parseArc()` in
DramaLeaderboard/DeskCard already assumes — NOT the rich object shape.

**Conclusion: that code path isn't live for MLB's currently-archived
games**, or writes some other sport/path. sustainedMinutes/trend/
classification are not actually available anywhere in what's stored
today, regardless of what that code block constructs.

---

## What's actually indicated, NOT yet tested

Both failures point the same direction: **the problem is scoring PEAK, not
the formula underneath it.** A per-moment score, however precise, gets
destroyed by taking a single max across hundreds of moments when most
games touch a close score somewhere.

Untested candidates that would use the FULL arc shape instead of a single
point: a time-weighted integral of drama over the game, count of
sustained-above-threshold duration (which `getDramaSustained` already
computes live, just not archived), or volatility/variance of the curve.

**None of this is built or verified.** Stated as a direction worth testing
next, not a recommendation.

---

## Governance note

This does not touch ADR-002/RUWT. RUWT governs what reaches the DOM for
LIVE games (named tier labels only, never a composite number). This
investigation is entirely about ARCHIVED, post-hoc peak values — the
leaderboard endpoint's own code comment already calls those "stored
facts," explicitly distinct from the live-DOM case. Nothing here proposes
changing what's shown during a live game.

---

## Files

- `validate_drama_scoring.py` — the validation script (real port of the
  old formula, a candidate continuous replacement, run against real ESPN
  data). Reusable for testing whichever direction comes next.
- Real result of this run: 25/25 games scored successfully, 0 fetch
  failures, full distribution and tier-change list in script output.
