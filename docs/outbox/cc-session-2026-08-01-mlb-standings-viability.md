# CC Session Outbox — MLB standings-trajectory viability check

**Date:** 2026-08-01
**Commit:** `13d7a50` (probe + CI workflow)

---

## What was asked

User shared a screenshot from a different discussion proposing "a live
playoff-stakes tracker using standings trajectories" as a weaker
alternative to some other feature, with the caveat "historical
standings-as-of-date is a real, unresolved gap." Question: is that gap
real for MLB specifically, and does MLB have an API that can back this?

## Real result

`scripts/probe-mlb-standings-history.mjs`, run via CI (statsapi.mlb.com
sandbox-blocked):
`outbox/mlb-standings-history-2026-08-01T11-44-33-791Z.txt`

- `statsapi.mlb.com/api/v1/standings?leagueId=103,104&season=2026&date=YYYY-MM-DD`
  genuinely changes its response by date — tested 5 real dates across
  the season for the Rays: 10-7 (4/15) → 29-14 (5/15) → 41-28 (6/15) →
  56-38 (7/15) → 64-45 (8/1). **5/5 distinct win-loss records.** This is
  NOT the same gap flagged elsewhere this session — this endpoint
  resolves it.
- Real playoff-stakes fields, all populated on live data (30 teams):
  `gamesBack`, `wildCardGamesBack`, `eliminationNumber` (plus sport/
  league/division/conference-scoped variants), `wildCardEliminationNumber`,
  `divisionRank`, `wildCardRank` (24/30 — only wild-card contenders get
  ranked), `clinched`, `divisionChamp`, `hasWildcard`, `magicNumber`
  (6/30 — only populated once a team is in real magic-number range),
  `streak`.
- Caveat: these fields are **strings**, not numbers — `"-"` is a real
  sentinel meaning "leads this race" (zero games back), not missing
  data. `"+6.5"` (leading the wild card by 6.5) uses a `+` prefix.
  Parsing needs to handle both explicitly rather than `Number()`-coercing
  blindly.
- Standings update once per real day (`lastUpdated` timestamp), not
  intra-game — fine for a day-by-day trajectory arc, not a substitute
  for a live in-game WP model.

## Verdict

Real viability for MLB is high, on a free real MLB Stats API endpoint
already partially used elsewhere in this codebase (`fetchStandings` in
`vite.config.js`'s dev mock references, `relay.js`'s
`mlb-stats/standings` route) — no new external dependency needed, just
a new query pattern (looping `date=` across a season) against an
endpoint already known-reachable.

No build was requested here — this is the viability answer only.

---

## Files changed

| Path | Status |
|------|--------|
| `scripts/probe-mlb-standings-history.mjs` | new — real historical date-param + field-availability probe |
| `.github/workflows/mlb-standings-history-probe.yml` | new — `workflow_dispatch` only |
| `outbox/mlb-standings-history-2026-08-01T11-44-33-791Z.txt` | new — real CI result |
| `docs/outbox/cc-session-2026-08-01-mlb-standings-viability.md` | new — this doc |
