# CC Session Outbox — JournalismBrief's Fabricated Endpoint + Dormant AmbientPanel Bug

**Date:** 2026-07-26
**PR:** jeffunglesbee-create/field-playground#15 (merged)
**Commit:** 30e9b8d (squash merge to main)

---

## What was asked

"Check why /journalism/brief isn't in field-relay-nba's source. And
automate other journalism follow-ups." Follow-up to an earlier
exploratory question ("What can go in the Journalism tab now") whose
honest answer at the time was "nothing, without fabricating something" --
this investigation reopened that conclusion by checking the one
component already in the tab, not just what could be added to it.

---

## What was found

**`/journalism/brief` was never real.** Zero hits searching
`field-relay-nba`'s source for `"journalism"`, `"brief"`, or `"/brief"`;
zero mentions across its own `HANDOFF.md`'s dozens of real session
close-outs. The dev mock in `vite.config.js` invented a `brief` string,
a `cycleId`, and a `proseScore` that never existed anywhere real --
`JournalismBrief` was only ever testing "a resource that polls on its
own schedule," never real journalism content. This had been true since
the component's original build; nobody had checked it until asked.

`/analytics/newspaper/{date}` -- the same endpoint `AmbientPanel`
already fetches -- IS real: `HANDOFF.md`'s 2026-07-24 entry documents it
explicitly, and a direct `probe_relay_route` call today reconfirmed its
live shape. That live probe surfaced real, currently-unused fields:
`pick.brief` (an editorial verdict line, distinct from `pick.ranked`,
which `AmbientPanel` already renders) and `night_stars` (a real
slate-quality rating: stars, starScore, dramaGames, closeGames, extras,
walkoffs, totalGames).

**Read `AmbientPanel` in full before building anything** -- specifically
to avoid duplicating its existing real `truth_is`/`contradiction`/
`quality_alert`/`sport_of_week`/`record_streak_board` coverage, which a
quick grep earlier in the session had missed entirely. That full read
surfaced a second, independent, dormant bug: `timeMode()` (morning/
midday/evening/late) has been computed and displayed as a label since
this component's original build, but the actual prose shown never
changed with it -- always `morning_report`, regardless of hour, even
though the real payload carries two more narrative fields (`preview`,
`late`) for exactly this purpose.

---

## What was built

- `JournalismBrief` now fetches `/analytics/newspaper/{date}` -- kept as
  a genuinely **separate** resource+poll loop from `ambientData` (not a
  read of it), preserving the component's original, valuable test: two
  independently-cadenced resources against the same real relay
  coexisting cleanly. Renders `pick.brief` and `night_stars`.
  Regeneration detection switched from the fabricated `cycleId` to
  comparing `pick.brief`'s actual text between polls.
- `AmbientPanel`'s `reportText` memo now picks `morning_report`/
  `preview`/`late` per `timeMode()`, with a same-cycle fallback chain
  when its first choice is absent, instead of always showing
  `morning_report`.
- Dev mock extended with the real fields now in use (`night_stars`,
  `pick.brief`/`type`/`score`/`reason`, `preview`, `late`), anchored to
  this repo's own existing mock slate.

---

## CodeRabbit findings -- 3 total across 3 rounds, all addressed

1. **Real: date navigation caused a false "updated" flash.** The
   resource reloads per `currentDate`; a new date's first verdict
   almost always differs from the old date's stored one, which the
   original fix's comparison read as a genuine regeneration. Fixed by
   tracking the verdict's own date alongside its text, only flashing
   when the date matches.
2. **Real: an already-active flash lingered across a date change.**
   The date-comparison fix suppressed *new* flashes on a date change
   but didn't clear one already in progress -- navigating within the
   4-second flash window could show "updated" for the new date's first
   render. Fixed: any date change now clears the flag and cancels the
   pending timeout outright.
3. **Real, inherited from the original component (not introduced by
   this PR): a `createMemo` used purely for side effects.** The
   regeneration-detector's return value was never read by anything --
   it only existed to write signals and schedule a timer, which is what
   `createEffect` is for. Converted, and added an `onCleanup` to clear
   the pending flash timeout on unmount, matching this component's own
   existing poll-interval cleanup pattern.

---

## Verification

`npm run build` clean at every stage. Playwright against the real dev
server confirmed: Journalism tab shows the real `pick.brief` verdict and
a correct star rating with real drama/close/walkoff detail; `Date`
override exercised all four `timeMode` buckets, each rendering its
correct real text field; rapid repeated date navigation produced no
stray "updated" badge and no console errors; no regression to
`AmbientPanel`'s existing real coverage.

---

## Files changed

| Path | Status |
|------|--------|
| `src/data/relay.js` | modified — `journalismBrief` resource now fetches the real endpoint, keyed on `currentDate` |
| `src/components/JournalismBrief/index.jsx` | rewritten — real fields, date-aware regeneration detection, `createEffect` |
| `src/components/JournalismBrief/JournalismBrief.module.css` | modified — star-rating styles replace fabricated-field styles |
| `src/components/AmbientPanel/index.jsx` | modified — `reportText` memo wires `timeMode()` to real narrative fields |
| `vite.config.js` | modified — dev mock extended with `night_stars`, richer `pick`, `preview`, `late` |

---

## What this does NOT change

- No relay/data-layer changes beyond correcting which endpoint is
  fetched -- `field-relay-nba` itself is untouched.
- `AmbientPanel`'s other real fields (`quality_feedback`, `streak_board`
  vs `record_streak_board`, `composite_brief`, `broken_record`,
  `completed_games`) remain as they were -- out of scope for this fix,
  not silently dropped.
