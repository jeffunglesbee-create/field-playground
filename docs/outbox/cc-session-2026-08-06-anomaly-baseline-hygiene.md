# CC Session Outbox — anomaly baseline hygiene, and why MLB is ahead

**Date:** 2026-08-06

---

## What was asked

"Both, and resolve the hygiene questions first." Round 1 confirmed a real, uncensored 30-day corpus is
viable for anomaly baselines but left three questions explicitly unresolved. Percentiles must not be
computed until they are, because all three move the numbers. Mid-round, a screenshot arrived from a
parallel session (Sonnet 5 Max) reasoning about why MLB is so far ahead of the other sports -- it turned
out to intersect this work directly, so its claims were verified against both repos and folded in here.

---

## The three hygiene questions, answered

**Q3 — sport-label normalization: REAL PROBLEM, confirmed.** One real case collision in the live data:
`WNBA` (69 real games) and `wnba` (6) are the same sport under two labels. Any per-sport bucketing MUST
case-fold or it silently fragments into undersized, wrong buckets. Separately `golf` (20) and `PGA Tour`
(6) are distinct labels not caught by case-folding -- reported for a human decision rather than merged by
guess (moot in practice, since both are excluded below).

**Q1 — cross-sport comparability: PER-SPORT BASELINES REQUIRED.** The real per-sport distributions are
not remotely on the same scale:

| Sport | n | distinct | min | p25 | med | p75 | p90 | max |
|---|---|---|---|---|---|---|---|---|
| mlb | 312 | **28** | 0 | 58 | 65 | 70 | 83 | 100 |
| wnba | 73 | **7** | 52 | 52 | 61 | 62 | 70 | 74 |
| fifa world cup | 59 | **7** | 52 | 52 | 57 | 63 | 70 | 78 |
| golf | 20 | **1** | 0 | 0 | 0 | 0 | 0 | 0 |
| pga tour | 6 | **1** | 0 | 0 | 0 | 0 | 0 | 0 |

A pooled baseline would misrank entire sports by scale mismatch. MLB is the only sport with a
distribution rich enough for genuine percentiles; WNBA and FIFA World Cup have **7 distinct values each**,
so any "percentile" there is really a coarse tier and should be presented as one rather than as false
precision.

**Q2 — the zeros: the probe's own automated verdict was WRONG, and the raw data it printed disproved
it.** The script concluded "KEEP THEM -- 0 is a real low score" purely from played-state (84.4% of zeros
had `finalized_at` set, so they looked played). But its own sample dump showed **10 of 12 sampled zeros
were golf/PGA Tour**. Golf games are `finalized_at`-set and so pass a naive played-check, yet their drama
is never computed at all. Of 32 total zeros, ~26 are golf-family; ~6 are residual MLB zeros needing
separate judgement. **The correct rule is exclude by SPORT, not by the value 0.** The verdict logic in
`scripts/probe-anomaly-baseline-hygiene.mjs` has been corrected to detect sports whose entire scored
population is 0 (metric unpopulated) rather than judging on played-state alone.

Pooled-percentile impact of removing zeros was negligible (median 62→62, p90 78→78) -- but that only
holds because it was pooled, which Q1 just ruled out anyway.

---

## Why: the mechanism, found in the relay's own code

The parallel session argued MLB is ahead because Baseball Savant is the only free validated per-play WP
feed. That is **correct for the WP-based features** (WP estimator, LiveWpTicker, WpSourceBadge, Fork
Point's real-splicing mode). But for the `drama_arc`-based features -- which is most of the sport-agnostic
surface (Hall of Surprises, The Unwatched, Leverage Index, Broadcast Call, Fork Point's default mode) --
the cause is different, internal, and fixable.

`field-relay-nba/scripts/drama-backfill.mjs`'s `dramaScoreLive()` computes
`base * 52 + timeBonus + sitBonus + upsetBonus`, and:

- **MLB** has a real `sitBonus` -- five situational rules reading `onFirst/onSecond/onThird`, `outs`,
  `balls`, `strikes`, RISP.
- **WNBA** and **AFL** have **no situational term at all** -- only `base` + `timeBonus`.
- **Soccer** has a single `+8` for stoppage time, plus a WC rank-upset term.
- **golf** -> `classifySport()` returns `'other'`, which has no historical-states fetcher, so drama is
  never computed and stays 0. That is the mechanical explanation for the 26 all-zero golf games measured
  above.

With only 4-5 discrete `base` values and few bonus levels, the non-MLB branches **mathematically cannot**
produce many distinct scores. The measured 7-distinct clustering is the arithmetic consequence, not a
coincidence -- and the most common single value across the whole corpus, 52, is exactly `base 1.0 × 52`
with no bonuses: a tied game, early.

---

## A question from the screenshot, closed for free

The parallel session flagged as its cheapest priority: *"WNBA's fetcher was noted as **probably**
unaffected [by the situational-field bug] since it never reads situational fields at all, but 'probably'
was never confirmed."*

**Confirmed from the code, and it is stronger than "probably."** WNBA's branch reads only `homeScore`,
`awayScore`, `period`, `clock`; AFL the same; soccer touches `clock` only for a `+` check. The
situational-field bug class is **structurally incapable** of affecting non-MLB sports. That audit needs no
run -- which deprioritizes the option that session recommended doing first.

**Could not verify:** `fetchESPNWinProb`, described there as "already confirmed correct at 0-1 scale for
NBA earlier this session," has **no hits in either field-playground or field-relay-nba**. It may live in a
repo not visible here, or be a misremembering. Since it is the load-bearing premise of that session's most
promising lead, it should be re-confirmed rather than inherited as settled.

---

## Consequences for the anomaly build

1. **Per-sport baselines, case-folded.** Mandatory, per Q1 + Q3.
2. **MLB only for real percentiles.** WNBA/FIFA get coarse tiers, honestly labelled as such.
3. **Exclude golf/PGA Tour entirely** -- unpopulated metric, not undramatic games.
4. **Open risk worth checking separately:** those 26 all-zero golf games flow into sport-agnostic
   components. Whether they surface as "maximally boring" rather than "not computed" has not been
   checked; existing arc-length filters may already drop them, but that is unverified.

---

## Scoped next: situational-enrichment viability probe

`scripts/probe-situational-enrichment-viability.mjs` + workflow, written and pushed this round. It asks
the one question that must be answered before any scoring change: `fetchWNBAHistoricalStates()` keeps
only 4 fields per play and **discards the rest of each real ESPN play object** -- is there anything real
left in there, at a real fill rate, that could support a situational term? Same for soccer, where red
cards and penalties are currently ignored entirely.

It reports real fields and real fill rates **only**, and deliberately does not propose a formula.
Designing bonuses against unverified fields is the exact mistake this repo's probe discipline exists to
prevent. Any real change to `dramaScoreLive()` would additionally need a backfill plan, since it would
alter every historical `drama_peak` the app already displays.

---

## Confidence gate

**95/100.** All three hygiene questions are resolved against a real 613-game/470-scored corpus, the
mechanism is confirmed by reading the actual relay source rather than inferred, and one cross-session open
question was closed at zero cost. Notably, this round caught **my own probe's automated verdict being
wrong** and corrected it from the raw data it had itself printed. The 5-point deduction: the ~6 residual
non-golf zeros are still unadjudicated, the golf-leakage risk into shipped components is flagged but
unverified, and `fetchESPNWinProb` could not be located to confirm or refute.

---

## Files changed

| Path | Status |
|------|--------|
| `scripts/probe-anomaly-baseline-hygiene.mjs` | modified -- corrected Q2 verdict to judge by sport, not played-state |
| `scripts/probe-situational-enrichment-viability.mjs` | new -- scoped next probe |
| `.github/workflows/situational-enrichment-viability-probe.yml` | new |
| `outbox/anomaly-baseline-hygiene-probe-2026-08-06T01-05-30-630Z.txt` | real CI result |
| `docs/outbox/cc-session-2026-08-06-anomaly-baseline-hygiene.md` | new -- this doc |
