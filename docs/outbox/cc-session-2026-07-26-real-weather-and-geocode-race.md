# CC Session Outbox — Real Open-Meteo Weather + VenueGeocodeRace

**Date:** 2026-07-26
**PR:** jeffunglesbee-create/field-playground#10 (merged)
**Commit:** 712f806 (squash merge to main)

---

## What was asked

"Fix weather by getting open-meteo information from docs on drive. Then,
use GitHub actions runner." The WeatherPoll incident fix (#8) had made
the crash safe but never asked whether `/weather/today/` should exist
at all — it never worked, only failed safely.

---

## What was found

`/weather/today/` was never built server-side, not gated. Google Drive
docs (FIELD's own production research) confirmed Open-Meteo as the
chosen weather API: free, no key, and — critically — CORS-open, meaning
the browser can call it directly with no relay proxy needed. That's why
`field-relay-nba` never had a `/weather` route: it was never supposed
to.

**This sandbox cannot reach either `api.open-meteo.com` or
`geocoding-api.open-meteo.com` directly** (proxy returns 403 on the
CONNECT tunnel) — every network question in this session used the
documented CI-as-proxy pattern: a GitHub Actions workflow
(`.github/workflows/open-meteo-probe.yml`) does the real fetch with
real network access, commits the result to `outbox/`, and this session
reads it back.

**A real methodology bug, caught and fixed mid-investigation:** the
first CORS probe used plain `curl` with no `Origin` header, so no
`access-control-allow-origin` could ever come back — a false negative
that would have pointed the fix toward building an unnecessary relay
proxy. Fixed by sending a real `Origin` header and a proper OPTIONS
preflight. **A parallel `chat.claude.ai` session hit and diagnosed the
exact same trap independently**, reaching the same conclusions
(CORS-open, same false-negative cause, and the same `App.artifact.jsx`
dead-code finding as PR #9) — its handoff doc
(`docs/outbox/chat-update-2026-07-26-weather-endpoint-investigation.md`)
proposed the geocoding-vs-table follow-up experiment.

---

## What was built

### Real WeatherPoll (`src/data/weather.js`)

Fetches Open-Meteo directly per real outdoor venue, venues derived from
`deskStore`'s actual games via a `createMemo` (same "derive from real
data" pattern as `App.jsx`'s `streakTeam`). Coordinates for this repo's
6 known venues — Citizens Bank Park and Globe Life Field confirmed
against Drive docs, the other 4 are well-established public stadium
locations (checked Drive four separate ways, not documented there).
Indoor venues (Footprint Center, Target Center) excluded by simply
having no coordinate entry — deliberately not porting production's
fuzzy indoor-keyword classifier, which has a real false positive on
this repo's venue list (`"Red Bull Arena"` contains `"arena"` but is
an outdoor MLS stadium).

### VenueGeocodeRace — the "genuinely playground-shaped experiment"

The handoff doc proposed testing whether Open-Meteo's geocoding API
could replace the hand-maintained coordinate table, predicting
geocoding could find coordinates but couldn't know dome status. A CI
probe ran that exact comparison for all 8 real venue names and found
something stronger than predicted: **geocoding-by-venue-name resolved
only 1 of 8** (Citizens Bank Park). The other 7 — including outdoor
ones like Yankee Stadium and Red Bull Arena — came back with zero
results. Open-Meteo's geocoder is built on a populated-places/POI
gazetteer, not a sports-venue database; branded stadium names mostly
aren't in it at all.

`VenueGeocodeRace` re-runs that comparison live in the browser against
today's real slate: static table lookup (instant, synchronous) raced
against a real per-venue geocoding fetch via `Promise.allSettled`, with
a manual trigger and a live tally.

---

## CodeRabbit findings — 6 total across 5 rounds, all addressed

1. **Empty-state copy said "today's slate"** when the component follows
   the selected date, not literally today. Fixed.
2. **Missing Open-Meteo attribution + false "no rate limit" claim.**
   Open-Meteo's data is CC BY 4.0 (requires visible credit); the free
   tier is generously but genuinely rate-limited. Removed the false
   claim, added a visible attribution link.
3. **Snow mislabeled as rain.** `current.precipitation` includes snow;
   `describeConditions` checked `rain`/`precipitation` without ever
   requesting `snowfall`, so snow (`rain === 0`, `precipitation > 0`)
   showed as "rain". Added `snowfall` to the query, checked before the
   rain fallback.
4. **`Promise.all` rejected the whole batch on one venue's failure**,
   hiding every other venue's successful result. Switched to
   `Promise.allSettled`. Did NOT add failure-state caching (also
   suggested) — this repo's realistic worst case (~8 req/min) is
   nowhere near Open-Meteo's free-tier limit (600/min), so that
   complexity would guard against a risk that doesn't exist at this
   scale.
5. **A real bug in fix #4, caught by CodeRabbit's own follow-up
   review:** when EVERY venue failed (not just one), the `allSettled`
   filter produced an empty-but-successful result, so WeatherPoll
   showed the misleading "no outdoor venues" empty state instead of
   its real error state during a total outage. Fixed: throw when the
   venue list was non-empty but nothing came back.
6. **The same class of bug, in `VenueGeocodeRace` this time:** a
   rejected geocoding request was collapsed into the same `hit: false`
   shape as a genuine no-results response, so a total outage would
   misreport as "0/8 geocoding hits" instead of "0/8 requests even
   completed." Added an explicit `failed` flag, rendered and counted
   separately from genuine misses.

---

## Verification

Every fix verified with real Playwright passes, not just a green build:
real network denial (this sandbox blocks both Open-Meteo hosts) shows
isolated errors with no app-wide crash; route interception with real
response shapes renders actual data; a mocked total-outage scenario
confirms the real error state instead of the misleading empty state;
mocked snow conditions confirm the correct label; the CI-confirmed
geocoding result shape (6/8 table, 1/8 geocode) is reproduced exactly
via mocked interception matching the real probe output.

---

## Files changed

| Path | Status |
|------|--------|
| `src/data/weather.js` | rewritten — real Open-Meteo fetch, `VENUE_COORDS`/`allVenues` exported |
| `src/components/WeatherPoll/index.jsx` | modified — copy, attribution, empty state |
| `src/components/WeatherPoll/WeatherPoll.module.css` | modified — attribution link style |
| `vite.config.js` | modified — dead `/weather/today/` mock route removed |
| `src/components/VenueGeocodeRace/index.jsx` | created |
| `src/components/VenueGeocodeRace/VenueGeocodeRace.module.css` | created |
| `src/App.jsx` / `src/App.module.css` | modified — `VenueGeocodeRace` wired in |
| `.github/workflows/open-meteo-probe.yml` | extended (on `main`, outside this PR) — CORS + geocoding probes |

---

## What this does NOT change

- No relay/backend changes — `field-relay-nba` is untouched; the fix is
  entirely client-side, matching the confirmed CORS-open reality.
- Production's 81-venue `VENUE_COORDS` table and its fuzzy indoor
  classifier were not ported wholesale — this repo's small, closed
  venue set uses an explicit table instead, which avoids a real false
  positive (`"Red Bull Arena"`) the fuzzy classifier would have hit.
