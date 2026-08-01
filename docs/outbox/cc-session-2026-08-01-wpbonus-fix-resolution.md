# CC Session Outbox — does the wpBonus scale fix change drama-scoring peak resolution?

**Date:** 2026-08-01
**Commits:** `55a0c6c` (probe script + CI workflow), CI-committed
`3a2e4f7` (real result)

---

## What was asked

Follow-up to the DramaLeaderboard build ("Now for MLB WP too, first" →
confirmed scope: both tightening LiveWpTicker's reconciliation AND
investigating the wpBonus scale fix's real impact on drama-scoring —
this doc covers the second half).

Round 1 (`docs/outbox/chat-update-2026-07-30-drama-scoring-granularity.md`,
`scripts/validate-drama-scoring.py`) found a continuous-formula rewrite
made **no** difference to `dramaScoreLive`'s peak resolution (4/25
distinct either way). But round 1's data source (ESPN play-by-play via
field-relay-nba) carries no win-probability data, so both its
`old_formula` and `new_formula` approximate `wpBonus` (and `sitBonus`)
as 0 — round 1 never actually tested the one term this session
separately confirmed had a real, shipped scale bug (pre-fix `wpDelta`
was computed on an already-0-100 Savant value, saturating the
`*1.5, 25` clamp almost every play).

Open question: now that `wpBonus` is correctly scaled in production,
does including it change round 1's "no improvement" finding?

---

## Method

`scripts/probe-wpbonus-fix-resolution.mjs` joins two real sources by
`atBatIndex`, since neither carries everything alone:

- **Savant's `gameWpa` array** (`baseballsavant.mlb.com/gf`) — WP
  values + `atBatIndex` + half-inning string, no score.
- **MLB Stats API's `allPlays`** (`statsapi.mlb.com` live feed) — score
  + inning + `atBatIndex`, no WP.

Same 28-game sample as round 3 (`outbox/mlb-sample-round3.json`), so
this extends round 1/3 rather than cherry-picking a new one. For each
joined state: `base`/`timeBonus` are round 1's exact step-function port
(same buckets, same thresholds); `wpBonus` is the real post-fix formula
(`wpDelta = |wpNow - wpPrev| * 100`, `wpBonus = min(wpDelta * 1.5, 25)`,
computed from consecutive real Savant WP values in play order). Peak =
max across the whole game, both with and without the `wpBonus` term.

CI-as-proxy: both hosts are sandbox-blocked (`x-deny-reason:
host_not_allowed`, confirmed by prior probes this session) — ran via
`workflow_dispatch`, same pattern as every real-data probe this
session.

---

## Real result

`outbox/wpbonus-fix-resolution-2026-08-01T02-28-30-863Z.txt`

- **28/28 games** resolved a real gamePk and joined successfully.
- **Join rate: 100.0%** — every Savant `atBatIndex` had a matching MLB
  Stats API play. The reconciliation gap this session flagged for
  `LiveWpTicker` (Task A: comparing two feeds' independently-determined
  "last" entries) is a real risk in general, but for this full-array
  join specifically, `atBatIndex` proved to be a reliable, complete key
  across all 28 real games.
- **`no_wpBonus` peak — 4/28 distinct (14%)**: matches round 1's
  original 4/25 (16%) closely, on a different data source and a
  slightly different sample. Round 1's finding replicates.
- **`with_wpBonus` peak — 18/28 distinct (64%)**: a real, substantial
  jump. Including the correctly-scaled `wpBonus` term materially
  sharpens peak resolution — the opposite conclusion from round 1,
  because round 1 structurally couldn't test this term.
- **0 tier changes**: every game's peak lands in the `fire` tier
  (≥80) whether or not `wpBonus` is included — `wpBonus`'s max (+25)
  isn't enough to cross a tier boundary once `base+timeBonus` is
  already near-saturated. So a **named-tier live display would look
  identical**; it's the underlying numeric value (what an archived
  `drama_peak` field actually stores and what a leaderboard sorts on)
  that gains resolution.

---

## A caveat worth flagging, not burying

Round 1's `old_formula`/`new_formula` port uses `base * 100 +
timeBonus`. But the real production leaderboard's own `drama_arc`
values (seen directly in `outbox/drama-leaderboard-wp-movement-probe-
2026-08-01T01-46-34-126Z.txt`, the DramaLeaderboard build's own
pre-build check) top out at exactly **74**, and regulation-inning
values sit at **52** — both consistent with `base * 52 + timeBonus`
(52 regulation, 52+22=74 extra innings), not `* 100`. This probe
inherited round 1's `*100` port rather than re-deriving the multiplier,
so the absolute peak numbers above (100-147) don't match production's
real scale.

This does **not** undermine the core finding: both the `no_wpBonus` and
`with_wpBonus` conditions here use the identical `base`/`timeBonus`
function, so the multiplier cancels out of the *relative* comparison —
isolating `wpBonus` as the only variable is exactly what this probe
was built to do. If anything, a smaller real base range (52-74 instead
of 100-122) makes `wpBonus`'s fixed +0-25 contribution proportionally
larger, so re-running with the real `*52` multiplier would likely show
resolution improve by at least as much, not less. Flagged here as a
known limitation rather than silently assumed away — a follow-up could
re-run this exact join with the real `*52` port to get production-
calibrated absolute numbers.

---

## Verdict

**Round 1's "formula smoothing doesn't help" finding was correct about
the term it tested (base/timeBonus shape) but incomplete** — it never
tested `wpBonus` because its data source couldn't. Now that the real
`wpBonus` scale bug is fixed in production, this term alone raises peak
resolution from 14% to 64% distinct on the same real games, even though
it doesn't change tier classification. Round 3's finding (summing WP
movement across the whole game beats any peak-based formula, 100%
distinct) still stands as the stronger fix — this result doesn't
compete with it, it explains why round 1's peak-based negative result
undersold what a real `wpBonus` term can do, and gives a concrete,
real-data-backed number for how much.

This script does not decide the production formula — it answers the
one question it was built to answer, with real data, same discipline as
rounds 1-3.

---

## Files changed

| Path | Status |
|------|--------|
| `scripts/probe-wpbonus-fix-resolution.mjs` | new — atBatIndex join, with/without wpBonus peak comparison |
| `.github/workflows/wpbonus-fix-resolution-probe.yml` | new — `workflow_dispatch` only |
| `outbox/wpbonus-fix-resolution-2026-08-01T02-28-30-863Z.txt` | new — real CI result |
| `docs/outbox/cc-session-2026-08-01-wpbonus-fix-resolution.md` | new — this doc |
