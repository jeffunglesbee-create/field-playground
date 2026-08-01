# CC Session Outbox — MLB live-in-game endpoint survey

**Date:** 2026-08-01
**Commit:** `653fb90` (probe + CI workflow)

---

## What was asked

Follow-up to the standings-viability check (standings update once per
real day, not intra-game): "any other endpoint that is live in-game?"

## Real result

`scripts/probe-mlb-live-endpoints.mjs`, run via CI against a real
gamePk (Yankees @ Cubs, 2026-07-31):
`outbox/mlb-live-endpoints-2026-08-01T21-37-06-267Z.txt`

Already verified and in active use elsewhere in this repo:
- `/api/v1.1/game/{gamePk}/feed/live` — full play-by-play, real-time
  score/inning/atBatIndex (`LiveWpTicker`, `dramaWpMovement.js`).
- `baseballsavant.mlb.com/gf?game_pk={gamePk}` — real per-play win
  probability (same components, plus the wpBonus-fix probe).

Newly confirmed real this session:
- **`/api/v1/game/{gamePk}/linescore`** — `currentInning`,
  `inningState` ("Bottom"), live `balls`/`strikes`/`outs`, per-inning
  scoring. The count/outs data `dramaScoreLive`'s `sitBonus` would need
  and that ESPN's play-by-play (round 1's data source) never had.
- **`/api/v1/game/{gamePk}/boxscore`** — full per-player live stats
  (12 real batters listed on the home side), not just the score.
- **`/api/v1/game/{gamePk}/playByPlay`** — same real play array as the
  live feed (63 real plays, `atBatIndex` present, matching the join key
  already validated for `LiveWpTicker`/the wpBonus probe) but as its
  own endpoint, useful when only play data (not the full game/team
  metadata the live feed also carries) is needed.
- **`/api/v1.1/game/{gamePk}/feed/live/diffPatch?startTimecode=...`** —
  incremental diff since a timecode, not the full feed. Real response
  included `gameEvents`/`logicalEvents` arrays (e.g. `midInning`,
  `countChange`, `game_finished`) — a genuinely more efficient polling
  primitive than re-fetching the full live feed every cycle, worth
  considering if a future feature polls more often than 20s.

## Verdict

MLB Stats API's live-game surface is broad and real: score/inning/
count/outs (linescore), full box (boxscore), plays (playByPlay, same
`atBatIndex` key already proven reliable), and an efficient diff
primitive (diffPatch) — all free, no key, same host already polled
live in this repo.

No build was requested here — this is the survey answer only.

---

## Files changed

| Path | Status |
|------|--------|
| `scripts/probe-mlb-live-endpoints.mjs` | new — real linescore/boxscore/playByPlay/diffPatch check |
| `.github/workflows/mlb-live-endpoints-probe.yml` | new — `workflow_dispatch` only |
| `outbox/mlb-live-endpoints-2026-08-01T21-37-06-267Z.txt` | new — real CI result |
| `docs/outbox/cc-session-2026-08-01-mlb-live-endpoints.md` | new — this doc |
