# CC Session Outbox — WP Source Badge (Proposal #3)

**Date:** 2026-07-31
**Commits:** `7e984a5` (feature), `909d098` (drift check CI result)

---

## What was asked

Build Proposal #3 (WP Source Badge) with the confidence gate applied,
automated follow-ups, no fallbacks.

## What "confidence gate" meant here

A static "ESTIMATED" text label on the existing ticker would have been
the cheap version of this feature — but the CC-CMD's own words are
"#3 shouldn't claim 'Estimated' is trustworthy until #1 proves it,"
and a label a user can't check against anything doesn't prove
anything. Since `baseballsavant.mlb.com` was already confirmed
CORS-open (`scripts/probe-wp-ticker-cors.mjs`, same CI run as
Proposal #2's check), the honest build fetches Savant's **real** WP
live, alongside the estimate, and badges both — so the "Estimated"
label sits next to a real number a user can compare it to, not just a
claim.

## What was built

- `src/components/WpSourceBadge/`: a reusable pill component —
  green **SAVANT** (real ground truth) vs amber **ESTIMATED** (the
  client-side model), matching this repo's existing color semantics
  (ScoreTicker's `.good`, WeatherPoll's `.roofNote` caveat amber).
- `LiveWpTicker` now fetches Savant's real WP (`scoreboard.stats.wpa.
  gameWpa`, same field + `/100` scale fix already proven in the
  validation lab) **independently** of the client-side estimate, for
  every live MLB game. Neither backstops the other: if Savant's fetch
  fails, it says "unavailable: \<reason\>" next to the SAVANT badge —
  it does not substitute the estimate or hide the row.
- A live **Δ Npp** line shows the real gap between the two sources for
  each game, continuing the validation lab's own comparison live
  instead of only against a historical sample.
- The extra-innings caveat badge (Proposal #2) now reads "SAVANT's
  real number is unaffected" — clarifying which of the two numbers the
  caveat actually applies to, now that both are shown.

## Automated follow-up — a real one, not automation theater

`scripts/wp-estimator-validation-lab.mjs` reads a **fixed, static**
28-game sample (`outbox/mlb-sample-round3.json`, all from 2026-07-16
to 07-18). Scheduling that script would recompute byte-identical
numbers forever — zero new information. Instead, `scripts/
wp-estimator-drift-check.mjs` checks the **frozen, already-shipped**
weights (`src/data/wpEstimator.js`, imported directly, never refit)
against real games from whenever it actually runs — genuine
out-of-sample data the weights have never seen. Scheduled monthly
(`0 12 1 * *`) via `.github/workflows/wp-estimator-drift-check.yml`,
since a season's shape drifts slowly, not weekly like the CORS check.

**First real run (triggered manually to confirm it works before
trusting the schedule), CI run 30667400957:**

| | |
|---|---|
| Fresh real games (2026-07-21 to 07-30, all Final) | 10 / 10 resolved |
| Fresh points (never used to fit or validate before) | 755 |
| Regulation-inning MAE on fresh data | **0.0283** |
| Original validation-lab baseline | 0.0289 |
| Verdict | **No drift detected** |

The frozen weights track real Savant WP on games they've never seen
almost identically to the original validation — real confirmation, not
an assumption that the original result still holds.

One honest gap: this 10-game sample had no extra-innings points, so
the drift check couldn't re-confirm the extra-innings weak spot this
round — it will whenever a fresh sample happens to include one.

## Verified

- `npm run build` — clean.
- Real browser test (Playwright + Chromium, mocked MLB/Savant response
  shapes matching the exact confirmed field paths): a regulation game
  (B6, 5-2) rendered SAVANT 90% (green bar) + ESTIMATED 92% (amber
  bar) + "Δ 2.4pp live vs Savant"; an extra-innings game (T11, 4-4)
  with a simulated empty Savant response rendered SAVANT "unavailable:
  no Savant reading yet" honestly (no fake number) alongside ESTIMATED
  56% and the extra-innings caveat badge. Screenshot confirms both
  states render correctly in the real app layout.
- `wp-estimator-drift-check.mjs` triggered live via CI and produced a
  real, non-trivial result (above) before being trusted on a schedule.

---

## Files changed

| Path | Status |
|------|--------|
| `src/components/WpSourceBadge/index.jsx` | new |
| `src/components/WpSourceBadge/WpSourceBadge.module.css` | new |
| `src/components/LiveWpTicker/index.jsx` | modified — dual-source fetch + badges + delta |
| `src/components/LiveWpTicker/LiveWpTicker.module.css` | modified — source-row/badge styling |
| `scripts/wp-estimator-drift-check.mjs` | new |
| `.github/workflows/wp-estimator-drift-check.yml` | new — `workflow_dispatch` + monthly schedule |
| `outbox/wp-estimator-drift-check-2026-07-31T21-40-39-162Z.txt` | new — real first CI result |

---

## All three WP wow-feature proposals are now built

1. WP Estimator Validation Lab — done, real MAE reported honestly.
2. Live WP Ticker — done, MLB-only, visible extra-innings caveat.
3. WP Source Badge — done, live dual-source display, not just a label.
