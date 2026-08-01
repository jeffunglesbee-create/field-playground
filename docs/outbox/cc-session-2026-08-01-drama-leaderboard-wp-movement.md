# CC Session Outbox — DramaLeaderboard: round 3's WP movement, live

**Date:** 2026-08-01
**Commits:** `47acbda` (pre-build shape/method re-check), `1eb823e`
(feature, shown alongside drama_peak), `763b00b` (drop drama_peak
entirely per follow-up instruction)

---

## What was asked

Follow-up to answering "is 74 a drama_peak cap, and is it more
incremental like recent builds described?" — which surfaced the
2026-07-30 three-round drama-scoring-granularity investigation already
sitting in this repo's own `docs/outbox/`, unshipped. User: build round
3's validated approach into field-playground first, then (mid-build):
drop the old drama_peak/sparkline display entirely, show only the
finer signal.

---

## Pre-build re-verification (Rule 87 discipline, not skipped)

Round 3's own script (`probe-savant-wp-metrics.mjs`) proved its method
against a cached 28-game historical sample. Before building any UI on
it, `scripts/probe-drama-leaderboard-wp-movement.mjs` re-ran the exact
same method against **today's actual live leaderboard**, not the old
sample — real, fresh confirmation:

- Confirmed the real `/archive/drama/leaderboard` response shape
  includes a real `date` field per game (needed for gamePk resolution;
  not assumed from relay.js's own comment, which never mentioned it).
- **All 8 games on today's real top-8 "Most Dramatic Games" tie at
  `drama_peak=74`** — 1/8 distinct. This is the exact screenshot the
  original question was about; 74 isn't a cap, it's just where the
  current top-8 all cluster.
- `total_wp_movement` distinguished all 8 of those same games (8/8
  distinct, range 3.30–7.18) — round 3's finding reconfirmed live, not
  just historically.

Full result: `outbox/drama-leaderboard-wp-movement-probe-2026-08-
01T01-46-34-126Z.txt`.

---

## What was built

`src/data/dramaWpMovement.js` — extracts the validated method
(resolve real MLB gamePk via date+team names, fetch Baseball Savant's
real per-play WP array, sum `|homeTeamWinProbabilityAdded|/100` for
`totalMovement`, same sum restricted to `inning >= 7` for
`lateMovement`) for reuse. Direct client fetch, no relay hop —
`statsapi.mlb.com`/`baseballsavant.mlb.com` both confirmed CORS-open
earlier this session (same basis `LiveWpTicker` already relies on).

`DramaLeaderboard` rebuilt around it:
- **First pass** showed WP movement alongside the existing drama_peak/
  sparkline (dual-source, neither backstopping the other — same
  pattern as `WpSourceBadge`).
- **Follow-up instruction** ("no leaderboard, just the finely grained
  round 3 option"): removed `drama_peak`, the sparkline, and the MLB/
  MLS sport tabs entirely. MLS was dropped rather than left in a
  degraded state — Baseball Savant is MLB-specific, so there's no
  round-3 equivalent to show for it, and showing MLS with the same UI
  but no signal would have been misleading.
- Games now rank by live `total_wp_movement` as each row resolves
  (stable sort: resolved rows rise above unresolved/errored ones; ties
  among unresolved rows keep their original order). The leaderboard
  endpoint is still the real source of *which* MLB games to list (real
  dates, needed for gamePk resolution) — it's just no longer what's
  displayed or ranked on.
- A row that can't resolve shows `unavailable: <reason>` honestly,
  never a fabricated number.

---

## Verified

- `npm run build` — clean, both passes.
- Local browser tests (Playwright, mocked real-shaped MLB Stats API +
  Savant responses):
  - First pass: confirmed the dual-source display computed correctly
    against mocked data (0.25 total / 0.18 late, hand-verified against
    the mocked input) while unmocked rows honestly showed
    "unavailable."
  - Follow-up pass: mocked three real games with deliberately
    different totals and confirmed the **re-ranking logic**, not just
    display — the originally-3rd-ranked game (given the highest mocked
    movement) correctly moved to rank 1.
- Real CI: `build-check.yml` and `artifact-check.yml` both passed
  clean against the final commit.

---

## Files changed

| Path | Status |
|------|--------|
| `scripts/probe-drama-leaderboard-wp-movement.mjs` | new — pre-build re-verification against today's real leaderboard |
| `.github/workflows/drama-leaderboard-wp-movement-probe.yml` | new — `workflow_dispatch` only |
| `outbox/drama-leaderboard-wp-movement-probe-2026-08-01T01-46-34-126Z.txt` | new — real CI result |
| `src/data/dramaWpMovement.js` | new — extracted, reusable WP-movement fetch/compute |
| `src/components/DramaLeaderboard/index.jsx` | modified — drama_peak/sparkline/sport-tabs removed, ranked by real WP movement |
| `src/components/DramaLeaderboard/DramaLeaderboard.module.css` | modified — dead peak/sparkline styles removed |
