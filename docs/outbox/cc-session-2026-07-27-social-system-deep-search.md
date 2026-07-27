# CC Session Outbox — DramaLeaderboard + RelaySystemStatus (Social/System Deep Search)

**Date:** 2026-07-27
**PR:** jeffunglesbee-create/field-playground#18 (merged)
**Commit:** b7fb62a (squash merge to main)

---

## What was asked

"Do the deep search on Social and System, then the wc anomaly." Direct
continuation of the same-day pattern established by PR #17's
`QualityReport`: search `field-relay-nba` for real, currently-unsurfaced
routes before proposing anything to build.

---

## What was found

Social's existing components (`Presence`, `TeamAffinitySync`, `Ground`)
are all local/client-side mechanisms (BroadcastChannel presence,
localStorage team affinity, a mock comment feed) -- none backed by real
relay data. System's existing components (`ReactivePerfPanel`,
`LatencyHistogram`) instrument this playground's own client-side
performance, never the relay's. Both tabs had a real gap the same
deep-search method could fill.

**`/archive/drama/leaderboard?sport=X` is real, live, and rich.** Direct
probe confirms: real completed games ranked by `drama_peak` (a real
excitement score), each with a `drama_arc` -- a JSON-string-encoded
per-play time series of drama scores across the whole game. Requires
`?sport=`, confirmed live for both MLB (74-point peaks) and MLS
(78/62-point peaks).

**`/health` is real, live, and genuinely different in shape from
everything else in this app.** It's plain text, not JSON: `"RELAY OK —
sub1 + sub2 + ... , quality-source=X"` -- a single status line listing
~32 live subsystems (nba, nhl, fpl, espn-summary, wc-d1, analytics-cron,
etc.) and the current `quality-source`.

---

## What was built

- `dramaSport`/`dramaLeaderboard` resource in `relay.js`, same
  signal-driven pattern as `currentDate`/`ambientData` -- changing
  `dramaSport` refetches with the new sport.
- `DramaLeaderboard`: a sport-toggle (MLB/MLS) leaderboard, ranked by
  `drama_peak`, each row rendering a real SVG sparkline built from that
  game's `drama_arc`. Mounted in the Social tab.
- `relayHealth` resource in `relay.js` -- the first `.text()` (not
  `.json()`) resource in this repo, since `/health`'s real response
  isn't JSON.
- `RelaySystemStatus`: parses the plain-text health line into an OK/
  DEGRADED status dot, the `quality-source` value, and a subsystem chip
  list. Mounted in the System tab.
- Dev mocks for both endpoints built from real captured probe responses
  -- `drama_arc` arrays are downsampled from the real, much longer
  captured arrays (real values and order, fewer points) to keep the mock
  file a reasonable size; `/health`'s mock is the exact real captured
  status line verbatim.
- Both wrapped in their own `SafeSection` for error isolation.

---

## CodeRabbit findings

None -- review completed with "No actionable comments were generated,"
all 5 pre-merge checks passed on the first pass.

---

## Verification

`npm run build` clean. Playwright against the real dev server confirmed:
Most Dramatic Games renders 3 real MLB games (drama_peak 74 each) with
rendered sparklines, correctly switches to 2 real MLS games (78/62) on
tab click; Relay Status renders "OK" with the real `quality-source` value
and 32 real subsystem chips (nba, nhl, fpl, fd, odds, ...); no console
errors beyond pre-existing unrelated sandbox noise; no regression to
`Presence`/`TeamAffinitySync`/`Ground`/`ReactivePerfPanel`/
`LatencyHistogram`.

---

## Files changed

| Path | Status |
|------|--------|
| `src/data/relay.js` | modified — `dramaSport`/`dramaLeaderboard` and `relayHealth` resources added |
| `src/components/DramaLeaderboard/index.jsx` | new |
| `src/components/DramaLeaderboard/DramaLeaderboard.module.css` | new |
| `src/components/RelaySystemStatus/index.jsx` | new |
| `src/components/RelaySystemStatus/RelaySystemStatus.module.css` | new |
| `src/App.jsx` | modified — both mounted in their own `SafeSection`, Social and System tabs respectively |
| `src/App.module.css` | modified — `.dramaLeaderboard`/`.relaySystemStatus` added to shared section layout class list |
| `vite.config.js` | modified — real captured mocks for `/archive/drama/leaderboard` and `/health` |

---

## The WC standings anomaly (not fixed here -- flagged for chat)

While investigating an earlier (false-alarm) StandingRoom report, a
direct probe of `/wc/standings` surfaced a real, separate, still-open
data issue: at least 8 teams (Bosnia-Herzegovina, Paraguay, Egypt,
Norway, Sweden, Senegal, Croatia, Congo DR) each have their record split
across TWO different World Cup groups -- one entry with a near-complete
`played` count (5-7) and a second stray entry with `played:1`. This is
relay-side data, not a playground rendering bug -- `StandingRoom`'s
`WcSection` just faithfully renders whichever group a team happens to
be filtered into, no client-side fix applies. Documented with exact
reproduction data in the `FIELD_Handoff` codex
(`wc-standings-split-team-records-2026-07-27`, category `incident`) for
the parallel chat session to investigate on `field-relay-nba`.

---

## What this does NOT change

- No relay/data-layer changes -- both endpoints already existed and were
  already live; this only surfaces them client-side.
- `Presence`, `TeamAffinitySync`, `Ground`, `ReactivePerfPanel`,
  `LatencyHistogram` are unmodified by this PR.
