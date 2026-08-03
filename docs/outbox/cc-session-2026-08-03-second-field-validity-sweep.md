# CC Session Outbox — second field-validity sweep: MLB standings + Savant WP

**Date:** 2026-08-03

---

## What was asked

"Check the other real data fields the same way" — continuing the
verify-underlying-data principle (`docs/GROUND-UP-DESIGN.md` #10) past
`drama_peak`/`drama_arc` into the other real, shipped fields this repo
depends on.

---

## What was checked, and why these two

Picked by reading the exact contract already implied by consuming code
— not an invented bound — same discipline as the `drama_peak` check:

1. **MLB standings** (`StandingRoom`'s `mlbTeamState`,
   `src/components/StandingRoom/index.jsx:99-107`): `gamesBack`/
   `wildCardGamesBack` are assumed to be either the literal string
   `'-'` or a string `parseFloat` can turn into a valid, non-negative
   number — otherwise `NaN` propagates silently into the `urgency`
   math and the UI would show "NaN GB". `divisionRank` is assumed
   `parseInt`-able and ≥1.
2. **Savant win probability** (`LiveWpTicker`'s `joinSamePlay`/
   `latestSavantWp`): raw `homeTeamWinProbability` is divided by 100
   and used directly as a probability — a real mathematical
   constraint requires it land in `[0, 1]` after scaling, not a
   guessed bound.

---

## Result

`scripts/probe-standings-and-wp-validity.mjs`, real data:

- **Standings**: 90 real team records across 3 real dates
  (2026-08-03, 2026-08-01, 2026-07-28). Every `gamesBack`/
  `wildCardGamesBack`/`divisionRank` checked was either `'-'` or a
  valid, sane value. Zero violations.
- **Savant WP**: 8 real games, 713 real `homeTeamWinProbability`
  entries. Every one, scaled `/100`, fell within `[0, 1]`. Zero
  violations.

Both assumptions confirmed valid — no fix needed for these two.

---

## What's still unchecked (real, not silently dropped)

Following this same discipline hasn't yet reached:

- **BSD xG fields** (`expected_goals`, `xg_per_minute`, `momentum`) —
  rendered directly by `BsdXgPanel` with only a nullish fallback, no
  range check.
- **FPL player fields** (price, ownership %, form, `ict_index`) —
  fetched but unused by any component today; lower priority until
  something actually renders them.
- **LaLiga standings/rankings** numeric fields — real, several
  unused endpoints per `docs/REAL-API-SURFACE.md`.
- **`quality_report`'s threshold scores** (the 125-170-range numbers
  shown in `QualityReport`) — no confirmed bound to check against yet;
  would need to read that component's own assumptions first, same as
  done here, before probing.

Not probed this round to keep scope deliberate rather than open-ended;
flagged here so the gap is visible, not silently implied "done."

---

## Files changed

| Path | Status |
|------|--------|
| `scripts/probe-standings-and-wp-validity.mjs`, `.github/workflows/standings-and-wp-validity-probe.yml` | new |
| `outbox/standings-and-wp-validity-probe-*.txt` | new — real, positive probe result |
| `docs/outbox/cc-session-2026-08-03-second-field-validity-sweep.md` | new — this doc |
