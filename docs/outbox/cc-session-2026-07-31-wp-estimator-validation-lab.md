# CC Session Outbox — WP Estimator Validation Lab

**Date:** 2026-07-31
**CC-CMD:** `docs/CC-CMD-2026-07-31-wp-estimator-validation-lab.md`
**Commits:** `698fc36` (Task 1 probe), `09db97c` (Tasks 2-3 build),
`a725b13` (CI result)

---

## Task 1 — re-verified from HEAD

- `outbox/mlb-sample-round3.json` still exists, still 28 real games
  with resolvable gamePks — reused as-is.
- Re-confirmed live via `scripts/probe-wp-estimator-inputs.mjs` (CI
  run 30597508595): Savant's `gameWpa` array has no score field.
  `scoreDiff` comes from MLB Stats API's `feed/live` endpoint
  (`liveData.plays.allPlays[i].result.homeScore/awayScore`), joined to
  Savant's WP readings by `atBatIndex` — confirmed 1:1 on 3 real games
  (array lengths and inning/halfInning matched exactly).
- `baseballsavant.mlb.com` and `statsapi.mlb.com` both still
  sandbox-blocked (`host_not_allowed`) — used CI-as-proxy, same as
  every prior round.

## Task 2 — the estimator

```
estimateWinProb({ scoreDiff, periodProgress }) =
  sigmoid(0.3114*scoreDiff + 0.7084*scoreDiff*periodProgress
          + 0.1696*periodProgress + 0.0893)
```

Fit by gradient-descent logistic regression (no ML dependency, 3000
epochs, lr=0.05) against real `(scoreDiff, periodProgress)` →
`(real Savant WP)` pairs, joined via the atBatIndex key confirmed in
Task 1. `periodProgress = min((inning-1+(bottom?0.5:0))/9, 1.0)` —
clamped at 1.0 for extra innings, so the model represents "how late"
rather than distinguishing the 10th from the 15th.

This is a fresh fit against real WP data, not `dramaScoreLive`'s
`base`/`timeBonus` formula repurposed — those were tuned for drama
contribution, not probability calibration.

## Task 3 — honest validation

Split **by game** (22 train / 6 test), not by play, to avoid leakage
from highly-correlated adjacent plays. Fit on train only. Real games,
real join, real Savant WP — 1,651 train points / 486 held-out test
points, all 28/28 sample games resolved and joined (0 skipped).

**Mean absolute error on held-out test games: 0.0289** (0-1 scale,
never seen while fitting).

| Inning | n | mean abs err |
|---|---|---|
| 1 | 43 | 0.0205 |
| 2 | 61 | 0.0423 |
| 3 | 52 | 0.0344 |
| 4 | 52 | 0.0228 |
| 5 | 51 | 0.0164 |
| 6 | 67 | 0.0277 |
| 7 | 60 | 0.0158 |
| 8 | 51 | 0.0210 |
| 9 | 42 | 0.0455 |
| 10 (extra innings) | 7 | **0.1375** |

Regulation innings (1-9) hold between 0.016 and 0.046 MAE — well
under the CC-CMD's own ~0.05-0.08 "plausibly trustworthy" threshold.
Extra innings are the one clear failure mode: **0.1375 MAE, ~3-6x
worse than any regulation inning**, on n=7 test points from a single
extra-innings sequence. That's a real, identifiable weakness, not
noise averaged away — `scoreDiff`/`periodProgress` alone don't capture
that extra-inning WP swings faster per run than regulation (Savant's
own model likely weights baserunner/out state, which this minimal
2-input estimator deliberately excludes).

---

## Plain verdict

**Trustworthy in regulation innings (1-9), not proven for extra
innings.** Overall MAE (0.0289) and every regulation-inning bucket sit
comfortably inside the CC-CMD's own bar for "plausibly usable as a
stand-in for NBA/MLS/EPL where no real ground truth exists." Extra
innings are the honest exception — the sample there is thin (n=7,
one sequence) so this isn't a confident "it fails," but it's a
concrete, specific gap that should not be silently papered over if
this estimator moves toward any UI.

No test-set tuning occurred — weights were fit once on train, MAE
computed once on the untouched test split, reported as-is.

---

## What this means for the other two proposals

Per the CC-CMD's own scope: **#2 (Live WP Ticker) and #3 (WP Source
Badge) remain gated and out of scope for this session.** The
estimator is not wired into any live UI component. Given the honest
result above, if #2/#3 proceed later they should account for the
extra-innings gap explicitly (e.g. a visible caveat or fallback state
during extra innings) rather than presenting the estimate with uniform
confidence across the whole game.

---

## Files changed

| Path | Status |
|------|--------|
| `scripts/probe-wp-estimator-inputs.mjs` | new — Task 1 shape/join probe |
| `.github/workflows/wp-estimator-inputs-probe.yml` | new — `workflow_dispatch` only |
| `outbox/wp-estimator-inputs-probe-2026-07-31T01-53-08-004Z.txt` | new — Task 1 CI result |
| `scripts/wp-estimator-validation-lab.mjs` | new — Tasks 2-3 build + validate |
| `.github/workflows/wp-estimator-validation-lab.yml` | new — `workflow_dispatch` only |
| `outbox/wp-estimator-validation-lab-2026-07-31T02-00-53-914Z.txt` | new — Tasks 2-3 CI result (real fitted weights + real MAE) |
