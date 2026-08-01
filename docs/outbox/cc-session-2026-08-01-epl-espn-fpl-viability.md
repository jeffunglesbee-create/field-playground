# CC Session Outbox — Premier League viability via ESPN + FPL

**Date:** 2026-08-01
**Commit:** `99c4090` (probe + CI workflow)

---

## What was asked

"Verify premier league using bsd/espn/fpl." "BSD" wasn't a term
established anywhere in this repo (the one hit, "BSD pitch" in
`Stats/index.jsx`, is an unrelated production UI-element name, not a
data source) — asked the user rather than guessing; confirmed scope:
skip BSD, verify via ESPN + FPL only.

## Real result

`scripts/probe-epl-espn-fpl.mjs`, run via CI (both hosts sandbox-
blocked, confirmed by direct curl before writing the probe):
`outbox/epl-espn-fpl-2026-08-01T23-50-49-981Z.txt`

**Structure confirmed real on both:**
- **ESPN** (`site.api.espn.com/apis/site/v2/sports/soccer/eng.1/...`,
  same shape/host family as other sports already used in this repo):
  real scoreboard returned a real scheduled fixture (Coventry City at
  Arsenal, 2026-08-21). The `summary?event=...` endpoint for that real
  event ID returned a full real shape: `boxscore`, `header`, `odds`,
  `rosters`, `standings`, etc.
- **FPL** (`fantasy.premierleague.com/api/...`, official, free, no
  key): `bootstrap-static` returned 20 real teams, 564 real players,
  38 real gameweeks. `fixtures` returned 380 real scheduled fixtures.

**Not yet confirmed — a real, honestly-reported gap:** today
(2026-08-01) sits in the Premier League's **pre-season window** — the
2026-27 season's first fixture is 2026-08-21, three weeks out. So:
- `commentary` was absent from the ESPN summary (no match has been
  played yet to generate any).
- FPL's `fixtures`: **0 finished, 0 currently live** — every one of
  the 380 real fixtures is still unplayed.
- FPL's `event/1/live`: **0 real player entries** — gameweek 1 hasn't
  happened, so there's no live per-player data to return yet.

This is a materially different situation from the MLB probes earlier
today, which could fall back to an actually-finished real game
(yesterday's Yankees @ Cubs) to confirm real *populated* values, not
just schema shape. Here, only the schema is confirmed real — the
actual behavior of `commentary`/`fixtures`/`event/{gw}/live` during a
real in-progress match remains untested until a real EPL match exists
to probe against.

## Verdict

Both ESPN (`eng.1`) and FPL are real, reachable (via CI), and
structurally sound for Premier League coverage — this repo could build
against either with confidence in the schema. But "live-in-game"
specifically is **not yet verified as working**, only as structurally
present — that claim needs re-testing once the season starts
(2026-08-21) or against a fixture from the just-finished 2025-26
season if verifying sooner matters more than waiting.

No build was requested here — this is the viability answer only.

---

## Files changed

| Path | Status |
|------|--------|
| `scripts/probe-epl-espn-fpl.mjs` | new — real ESPN eng.1 + FPL structure/shape check |
| `.github/workflows/epl-espn-fpl-probe.yml` | new — `workflow_dispatch` only |
| `outbox/epl-espn-fpl-2026-08-01T23-50-49-981Z.txt` | new — real CI result |
| `docs/outbox/cc-session-2026-08-01-epl-espn-fpl-viability.md` | new — this doc |
