# CC Session Outbox — VENUE_COORDS expansion, retractable-roof weather fix

**Date:** 2026-07-27
**PR:** jeffunglesbee-create/field-playground#27 (merged)
**Commit:** a8804f0 (squash merge to main)

---

## What was asked

A screenshot of `WeatherPoll`/`VenueGeocodeRace` against today's real
13-venue slate showed 0/13 static-table hits and an empty weather panel
("No outdoor venues with known coordinates"). Asked what the novel fix
was -- external geocoding (already proven unreliable for branded venue
names via an earlier CI probe, 1/8 hits) vs. pulling more of the SAME
canonical source the existing 5 entries came from: production's own
comprehensive venue table. User then gave two explicit instructions:

1. Retractable-roof stadiums (Globe Life Field, loanDepot park, Rogers
   Centre, Daikin Park, etc.) should still show weather -- they were
   being excluded outright.
2. Pull the rest of production's table and expand `data/weather.js`.

Mid-session the user also said "Use GitHub actions runner for api
calls" -- a reminder to use the established CI-as-proxy pattern for any
real Open-Meteo verification, since this sandbox's egress allowlist
blocks `api.open-meteo.com` directly.

---

## What was built

`VENUE_COORDS` had only 5 hand-picked entries tuned for an earlier mock
slate -- 0/13 hits the moment the real slate rotated to different games.
Ported production's own comprehensive table (jubilant-bassoon's
`src/utils/venues.js`, ~90+ entries) via FIELD_Handoff, with two
deliberate corrections:

- **Reversed the roof-as-gate design.** Production treats `isOutdoor:
  false` as "don't fetch weather here" -- Globe Life Field was excluded
  outright, and this file did the same before today. A retractable-roof
  or domed stadium still has a real physical location with real
  weather; the roof affects what the game experiences, not whether
  weather data exists. Tuple format changed from `[lat, lon]` to
  `[lat, lon, roofType]` (`'open'`/`'retractable'`/`'dome'`), now
  informational metadata surfaced as a badge in `WeatherPoll` rather
  than a gate.
- **Fixed loanDepot park's classification.** Production files it as
  `isOutdoor: true` -- wrong, it's Marlins Park, a real retractable-roof
  stadium like Globe Life Field or Chase Field. Filed as `'retractable'`.

Also added, beyond production's table:
- `"Rate Field"` / `"Daikin Park"` aliases -- both parks renamed in
  2025, after production's table was last updated, both confirmed live
  in today's real relay slate.
- `"TPC Twin Cities"` -- hosts the 3M Open, not among the majors
  production's golf coverage curates, but appears in this app's own
  real slate.
- **PNC Park, Citi Field, Sutter Health Park** -- confirmed via
  `FIELD_Handoff read_source` to be genuinely absent from production's
  table entirely (they only turn up in unrelated seed SQL, never in
  `venues.js`), each present in today's real 13-venue slate.

Extended `.github/workflows/open-meteo-probe.yml` with a step that
fetches real weather for the retractable/dome venues and the new
additions from a GitHub Actions runner, per the CI-as-proxy pattern.

---

## CodeRabbit findings -- 3, all real, all addressed

1. **Dome coverage claimed but never exercised.** The first version of
   the probe listed 4 retractable-roof venues but zero domes, so its
   own "dome" claims were never actually tested. Fixed: added Tropicana
   Field, the one true fixed dome in `VENUE_COORDS` -- confirmed
   resolving to a real temperature (79.4°F) in the re-run.
2. **Probe used a hand-copied fixture, not the canonical table.** The
   first version duplicated lat/lon/roofType as a literal string in the
   workflow -- could report success while the real table drifts or has
   a typo, silently. Fixed: the step now parses `VENUE_COORDS` directly
   out of `src/data/weather.js` at run time (brace-matched extraction +
   `Function()` eval, since the file can't be `require`d as-is -- it
   imports `solid-js`/`relay` for its own reactive exports). The probe
   can no longer disagree with the table it's meant to verify.
3. **Per-venue failures didn't fail the step.** `echo ... | while read`
   ran the loop in a subshell, so a fail counter incremented inside it
   never survived to the parent shell -- a failed venue would still
   report step success. Fixed: switched to a plain bash array + `for`
   loop (no subshell), and the step now exits non-zero when any venue
   failed, visible in job annotations even though `continue-on-error`
   still keeps the overall job from blocking on it.

---

## Verification

- `npm run build` clean at every stage.
- GitHub Actions probe, re-run after the CodeRabbit fixes
  (`outbox/open-meteo-venue-coverage-probe.txt`): all 16 probed venues
  returned `http=200` with a real, sane temperature -- all 4
  retractable-roof venues the user named by name (Globe Life Field
  97.8°F, loanDepot park 85.2°F, Rogers Centre 80.5°F, Daikin Park
  91.0°F), Tropicana Field as the genuine dome case (79.4°F), and the 3
  new production-gap venues (PNC Park, Citi Field, Sutter Health Park).
  Coordinates were read straight out of `src/data/weather.js` at CI run
  time, not hand-copied, so this is a real end-to-end check of the
  shipped table.
- Locally: dev mock's static-table hit count went from 5/8 to 6/8 (adds
  Globe Life Field; Footprint Center/Target Center correctly still
  excluded -- NBA arenas, never eligible for weather, no coordinates
  ever added for them).
- Full 7-tab regression sweep: zero dead sections, zero unexpected
  console errors (the one pre-existing `health-check throw` console
  error is `HealthPanel`'s own intentional `ErrorBoundary` test, not a
  regression).
- Real Open-Meteo weather values can't be fetched from this sandbox
  directly (egress block, same as every prior weather-related change in
  this repo) -- confirmed via the CI probe above instead, per the user's
  explicit "use GitHub Actions runner for API calls" instruction.

---

## Files changed

| Path | Status |
|------|--------|
| `src/data/weather.js` | modified -- `VENUE_COORDS` expanded 5 -> 103 entries, `roofType` metadata added, no longer gates weather |
| `src/components/WeatherPoll/index.jsx` | modified -- roof-status badge per venue row, updated empty-state text |
| `src/components/WeatherPoll/WeatherPoll.module.css` | modified -- `.roofNote` badge styling |
| `.github/workflows/open-meteo-probe.yml` | modified -- added canonical-table-sourced coverage verification step |

---

## What this does NOT change

- `VenueGeocodeRace`'s own logic is untouched -- the tuple's first two
  elements keep their positions with the new third `roofType` element,
  so `staticHit()[0]`/`staticHit()[1]` still work unmodified.
- Real-time weather VALUES still can't be verified from this sandbox --
  only the venue-list/coordinate/roofType side is verifiable directly
  here; actual temperatures are confirmed via the CI probe, not by a
  live in-sandbox fetch.
- Production's own table is unchanged -- the two corrections
  (roof-as-gate reversal, loanDepot park's roof type) are deliberate
  divergences specific to this repo, documented in `weather.js`'s own
  header comment, not fixes proposed back upstream.
