# chat-update-2026-07-30-drama-scoring-round3

**From:** chat (claude.ai)
**Follows:** -granularity.md, -round2.md
**Trigger:** explicit correction to stay on the original thread rather
than let the Drive-search side quest (dead-code revival CC-CMDs)
displace it. This round is the direct, informed continuation: the real
insight from that search wasn't "build the NFL system" — it was "WPA
beats score-diff proxies," tested here against MLB with data already
live (Savant), no new infrastructure.

---

## Result: real WP data beats every proxy tested today

| Metric | Source | Resolution |
|---|---|---|
| peak (round 1) | score-diff step function | 16% (4/25) |
| sustained_late_closeness (round 2) | score-diff proxy | 44% (11/25) |
| comeback_magnitude (round 2) | score-diff proxy | 20% (5/25) |
| **total_wp_movement** (round 3) | **real Savant WPA** | **100% (28/28)** |
| **late_wp_movement** (round 3) | **real Savant WPA** | **100% (28/28)** |

Both new metrics hit full resolution because they sum dozens of small
real per-play win-probability deltas (64-90 real plays per game) rather
than reducing a game to one score-diff snapshot. Range: total 70.6-588.9,
late 0.1-356.9.

## The two metrics capture different things — confirmed, not assumed

Top-5 by total movement and top-5 by late movement **differ**: Tigers
@ Angels ranks top-5 late but not top-5 total; Rangers @ Braves is the
reverse. A game can churn through the middle innings without a
dramatic finish, or stay calm most of the way and detonate in the 9th.
This is the real reason the NFL spec (found via the earlier Drive
search) weights these two axes differently (40%/25%) rather than
treating one as redundant with the other — now confirmed on real MLB
data rather than taken on the spec's word.

## Data source

`fetchSavantGameFeed` (field.js) only ever reads the LAST array entry
for a live display badge. The raw Baseball Savant response
(`baseballsavant.mlb.com/gf?game_pk=X`) carries the FULL per-play array
— confirmed by direct shape inspection, not assumed:

```
{ homeTeamWinProbability: 52.2, awayTeamWinProbability: 47.8,
  homeTeamWinProbabilityAdded: 2.2, hwp: 2.2, awp: -2.2,
  atBatIndex: 0, i: "T1", capIndex: 14 }
```

`i` (half-inning string, "T1"/"B9") was the one field genuinely unknown
before this round — deliberately not guessed. First run dumped the raw
shape and logged only `total_wp_movement`; second run, same cached
28-game sample, added `late_wp_movement` once the real field name was
confirmed.

## Method note: CI-as-proxy, two hops

`statsapi.mlb.com` (needed to resolve ESPN's event IDs to real MLB
`gamePk` — a different ID system Savant requires) and
`baseballsavant.mlb.com` are both sandbox-blocked
(`x-deny-reason: host_not_allowed`, confirmed directly, not assumed).
Both resolved from the same GitHub Actions run. All 28 games resolved
real gamePks and returned real WP data — zero skips.

## One thing flagged, deliberately not chased further

`homeTeamWinProbability` values are 0-100 (e.g. 52.2), but
`fetchSavantGameFeed`'s own comment in field.js states *"WP scale: 0-1
fraction (e.g. 0.72 = 72%)."* That's a real discrepancy between the
comment and the live data. **Not confirmed as a display bug** — the
actual DOM-rendering consumer of `.wp` was not traced this round.
Noted rather than pursued, to avoid the exact kind of scope drift this
round was created to correct.

---

## Files

`scripts/probe-savant-wp-metrics.mjs` — reusable; the cached 28-game
sample (`outbox/mlb-sample-round3.json`) lets any follow-up recompute
against the identical games rather than resampling.
