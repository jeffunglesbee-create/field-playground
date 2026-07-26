# CC Session Outbox — Venue Coordinate Audit (Globe Life Field Dome Bug)

**Date:** 2026-07-26
**PR:** jeffunglesbee-create/field-playground#12 (merged)
**Commit:** 81426f0 (squash merge to main)

---

## What was asked

"Look back at this session and this chat as a whole for unproduced
items" — a self-audit, not a new feature request. The audit surfaced one
concrete, actionable finding: a real bug in already-merged code that had
never been circled back to. Follow-up: "fix all with novel thinking. no
pattern matching. automate follow-ups. no fallbacks, only fixes."

---

## What was found

While investigating park factors earlier this session (PR #11), I read
jubilant-bassoon's real `src/utils/venues.js` — production's own
hand-maintained `VENUE_COORDS` table — via FIELD_Handoff, but never
cross-checked it against this repo's own `src/data/weather.js` (merged
in PR #10). Doing that during the audit surfaced two real defects sitting
in merged code:

1. **Globe Life Field was misclassified as outdoor.** Production's own
   table files it under `// MLB retractable-roof / dome -> false` — a
   closed dome, not a real weather venue. `weather.js` had it in the
   outdoor-venue table with no positive confirmation it was ever
   outdoor; it was simply never excluded when the file was written. In
   practice, WeatherPoll was fetching and displaying live "weather" for
   an indoor stadium.
2. **Three venues carried unconfirmed public-knowledge coordinates.**
   America First Field, Red Bull Arena, and Dick's Sporting Goods Park
   were never confirmed against a FIELD-specific source (the original
   Drive-doc pass only ever confirmed Citizens Bank Park and Globe Life
   Field's coordinates -- not roof status, and not the other four
   venues at all). Dick's Sporting Goods Park's was off by roughly 0.2°
   of longitude (~10+ miles) -- enough to plausibly return a different
   local forecast.

---

## What was fixed

`src/data/weather.js`: removed Globe Life Field from `VENUE_COORDS`
entirely (it now joins Footprint Center and Target Center as venues with
no coordinate entry -- the existing, correct pattern for "no weather
fetch here"); corrected America First Field, Red Bull Arena, and Dick's
Sporting Goods Park to production's confirmed coordinates. Citizens Bank
Park and Yankee Stadium already matched exactly, no change needed.

Deliberately not ported: production's real `getVenueCoords`/
`isOutdoorVenue` do a base-name fuzzy match (splitting on the first
comma) to reconcile production's "Venue, City" key style against bare
venue names. This repo's mock venue names already come through bare, so
that fuzzy match would have nothing to reconcile here -- it would be
dead code solving a naming mismatch this repo doesn't have.

---

## CodeRabbit

No actionable comments. All 5 pre-merge checks passed.

---

## Verification

`npm run build` clean. Playwright against the real dev server confirmed
`VenueGeocodeRace`'s static-table hit count correctly dropped from 6/8 to
5/8, Globe Life Field now reports `table: miss`, and the three corrected
venues show their exact new coordinates in the live comparison table.
Confirmed neither `WeatherPoll` nor `VenueGeocodeRace` hardcodes a stale
venue count -- both derive it dynamically from `VENUE_COORDS`/
`allVenues()`, so the fix propagated with no other code changes needed.

---

## Files changed

| Path | Status |
|------|--------|
| `src/data/weather.js` | modified — Globe Life Field removed, 3 venues' coordinates corrected, comments updated to cite the real source |

---

## Still-open items from the same audit (not part of this fix)

- `Stats.jsx`'s own deferred list (per-game scouting reports, MLS novel
  metrics, milestone alerts, BSD pitch, comeback probability) remains
  deferred -- these need confirmed data sources this session doesn't
  have, not a fix to existing code.
- Only 4 of `UMPIRE_ABS_RATINGS`' 48 real umpire names have a confirmed
  rate/weakness (see PR #11's outbox doc) -- not backfilled with
  invented numbers.
- jubilant-bassoon's live production URL was never found this session,
  which would have let FIELD_Handoff's browser tools pull more real
  park-factor examples directly -- abandoned as a research thread, not
  a defect.
