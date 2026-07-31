# CC Session Outbox — Live WP Ticker (Proposal #2)

**Date:** 2026-07-31
**Commits:** `3cc2c16` (CORS pre-check), `8170b24` (CORS result),
`b104816` (feature)

---

## What was asked

Build Proposal #2 (Live WP Ticker) from the three WP wow-feature
proposals, with a visible extra-innings caveat state — following the
WP Estimator Validation Lab's own honest result (regulation MAE
0.0289, extra-innings MAE 0.1375) rather than presenting the estimate
with uniform confidence.

## Pre-build check, not an assumption

deskStore's real game data has no inning/period field today (an
existing, already-documented gap — DeskCard's own comment: "the real
system's CRUNCH/CLOSE_LATE tiers depend on ESPN's live period + game
clock via findESPNScore(), which deskStore doesn't expose in the same
form"). So the ticker needs a real live source for period/inning, not
an approximation built on top of an incomplete field.

Before assuming a direct client fetch to `statsapi.mlb.com` would even
be possible, `scripts/probe-wp-ticker-cors.mjs` checked the real
`Access-Control-Allow-Origin` header on both the schedule and
live-feed endpoints via CI (`baseballsavant.mlb.com`/`statsapi.mlb.com`
sandbox-blocked from chat, CI-as-proxy as usual). Confirmed live:
**both return `Access-Control-Allow-Origin: *`** — a real browser can
fetch them directly, same as WeatherPoll's confirmed-CORS-open
Open-Meteo call, no proxy needed. Scheduled weekly (Monday 09:45 UTC)
as a standing health check, since a future CORS tightening on MLB's
side would otherwise break every browser silently at once.

## What was built

- `src/data/wpEstimator.js`: `estimateWinProb`/`periodProgress`
  extracted for reuse, carrying the exact fitted weights and both
  validated MAE figures from the validation lab's real CI run as
  named constants (not re-derived, not re-guessed).
- `src/components/LiveWpTicker/index.jsx`: MLB-only (the only sport
  the estimator was validated on — not silently extended to NBA/MLS/
  EPL). Own 20s poll cadence, direct fetch to `statsapi.mlb.com`
  (schedule for gamePk resolution, cached; `feed/live` for state),
  using the exact `allPlays[last].result.homeScore/awayScore` /
  `.about.inning/halfInning` field path already proven across 28/28
  real games in the validation lab's own CI run — not a new guess at
  the API's shape.
- Visible caveat: a full-width badge (not a tooltip-only footnote)
  reading "⚠ extra innings — less reliable" whenever `inning > 9`,
  citing the real validated MAE numbers in its title attribute.
  Distinct red styling from the plain WP bar shown for regulation
  innings.
- Real errors surface as real errors ("unable to load: <message>"),
  never silently swallowed or replaced with a fake value.

## Verified

- `npm run build` — clean.
- Local browser test (Playwright + Chromium) against the dev mock: the
  ticker correctly picks up deskStore's live MLB games (Red Sox @
  Yankees, Astros @ Rangers), attempts the real direct fetch, and
  fails with an honest "unable to load: Failed to fetch" — expected in
  this sandboxed environment (same network block as every other
  direct-fetch probe this session), not a bug.
- Full code path verified end-to-end with realistic mocked MLB API
  responses (`page.route`, real response shapes): a regulation-inning
  game (B6, 5-2) rendered a clean 91.9% WP bar with no badge; an
  extra-innings game (T11, 4-4, tied) rendered 56.4% WP **and** the
  red "EXTRA INNINGS — LESS RELIABLE" caveat badge. Screenshot
  confirms both states render correctly side by side in the real app
  layout.

## What's still not proven

Real live-browser behavior against the actual `statsapi.mlb.com`
endpoints (not just its CORS headers) is unverified from this
environment — the endpoint itself is confirmed reachable and
CORS-open, and its response shape is confirmed via 28 real games in
the validation lab, but a real live browser fetch through this exact
component has not been observed to succeed (only its CORS headers and
mocked-response rendering have). Worth a live spot-check once this
deploys somewhere with real network access.

---

## Files changed

| Path | Status |
|------|--------|
| `scripts/probe-wp-ticker-cors.mjs` | new — CORS pre-check |
| `.github/workflows/wp-ticker-cors-probe.yml` | new — `workflow_dispatch` + weekly schedule |
| `outbox/wp-ticker-cors-probe-result.txt` | new — real CI result |
| `src/data/wpEstimator.js` | new — shared estimator, real fitted weights |
| `src/components/LiveWpTicker/index.jsx` | new |
| `src/components/LiveWpTicker/LiveWpTicker.module.css` | new |
| `src/App.jsx` | modified — wired in next to ScoreTicker |
| `src/App.module.css` | modified — `.liveWpTicker` layout class |

---

## Still out of scope

Proposal #3 (WP Source Badge) remains unbuilt — not requested this
round.
