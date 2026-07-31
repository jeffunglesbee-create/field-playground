# CC Session Outbox — fix Savant WP scale bug in field-playground

**Date:** 2026-07-31
**Commit:** 99886d7 (fix), a26b52e + c1a213b (CI re-runs, corrected results), 04b0a17 (gitignore cleanup)

---

## What was asked

Following the wp#1/wp#2 mobile-session analysis: fix the Savant WP
scale bug in field-playground too, matching jubilant-bassoon's own
same-day fix to `fetchSavantGameFeed`.

---

## What was found and fixed

Two scripts inherited the bug from consuming Savant's real API
directly: `scripts/probe-savant-wp-metrics.mjs` (round 3, JS) and
`scripts/drama-round3-wpa.py` (round 3, Python). Both compute
downstream metrics from `homeTeamWinProbability`/`Added`, which
Savant's real API returns on a 0-100 scale despite `field.js`'s own
adjacent comment claiming 0-1 — the JS probe's own trailing note had
called this "an open discrepancy... NOT confirmed as a display bug";
the Python script's raw diagnostic dump had caught the symptom (a
9230-scale `wpa_comeback` value) without chasing the cause.

Fixed both at the single read point (same principle as jubilant-
bassoon's own fix: normalize the source, don't scatter defensive
scale-detection across consumers):
- `probe-savant-wp-metrics.mjs`: divides `homeTeamWinProbabilityAdded`
  by 100 before summing into `totalMovement`/`lateMovement`.
- `drama-round3-wpa.py`: new `normalize_wp_scale()` helper applied
  right after fetch (after the raw diagnostic dump, kept unmodified
  as the honest historical record of the true raw shape) — so
  `wpa_comeback`'s `50 - worst*100` and `wpa_sustained_late`'s
  `abs(wp-0.5)<=0.15`, both written assuming a 0-1 input, are correct
  again.

Verified against synthetic data shaped like the real confirmed
response before trusting it on real data: `wpa_comeback` on a
realistic deep-deficit case returned a sane 42.3 (not the old
9230-scale garbage); the JS probe's `totalMovement` on the same case
returned ~1.35 (not ~135).

---

## Re-verified against real data via CI

Both probes re-run on GitHub Actions (`baseballsavant.mlb.com` is
sandbox-blocked from this environment, same CI-as-proxy pattern used
all session):

| Metric | Before (buggy) | After (fixed) |
|---|---|---|
| `total_wp_movement` range | 70.6 – 588.9 | **0.706 – 5.889** |
| `late_wp_movement` range | 0.1 – 356.9 | **0.001 – 3.569** |
| `wpa_comeback` range | up to 9230 (garbage) | **0.0 – 48.5** (sane 0-50pp) |
| `wpa_sustained_late` range | (unreliable — `close` filter almost never matched on 0-100 input) | **0.0% – 87.2%** |

Exactly the predicted `/100` relationship on the two movement metrics,
confirming the fix behaves identically on real data as it did on the
synthetic test case.

**Round 3's qualitative finding is unaffected.** A uniform positive
linear rescale (`/100` applied to every value) cannot change which
games rank above others by either metric — this is a direct
mathematical consequence, not something that needed re-testing.
Resolution held at 28/28 distinct (100%) for `total_wp_movement` and
`late_wp_movement`, and 24/25 distinct (96%) for `wpa_sustained_late`/
`wpa_comeback` — consistent with the original run's "beats every
proxy tested" conclusion. What changed is that the *absolute* numbers
in the original run's outbox record were wrong; they're now real.

---

## Files changed

| Path | Status |
|------|--------|
| `scripts/probe-savant-wp-metrics.mjs` | modified — scale fix + corrected trailing note |
| `scripts/drama-round3-wpa.py` | modified — `normalize_wp_scale()` helper |
| `outbox/savant-wp-metrics-2026-07-31T01-46-16-958Z.txt` | new — corrected CI re-run |
| `outbox/drama-round3-wpa-result.txt` | overwritten — corrected CI re-run |
| `.gitignore` | modified — added `__pycache__/`/`*.pyc` (unrelated hygiene fix, same commit batch) |
