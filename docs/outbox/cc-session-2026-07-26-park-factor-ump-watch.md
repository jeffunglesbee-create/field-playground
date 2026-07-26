# CC Session Outbox — Real Park Factor + Ump Watch Leaderboards

**Date:** 2026-07-26
**PR:** jeffunglesbee-create/field-playground#11 (merged)
**Commit:** 6818f2b (squash merge to main)

---

## What was asked

"Check FIELD_Handoff for real park factor and umpire stats. Automate
follow-ups. No fallbacks, only fixes. All should be rooted in solid.js."
`Stats.jsx`'s own header comment had already flagged park factor and
umpire tendencies as deliberately deferred, pending a confirmed real data
source — the same "don't assume a data shape from a name" discipline
this repo has followed all session.

---

## What was found

`PARK_FACTORS` and `UMPIRE_ABS_RATINGS` are static baked JS constants
inside `jubilant-bassoon/index.html` (confirmed via `CODE_MAP.json`:
`PARK_FACTORS` L8456-8488, `UMPIRE_ABS_RATINGS` L8397-8449, `getParkFactor`
L8877, `getUmpireABSRating` L8858) — **not** served over any
`field-relay-nba` HTTP route (`read_source` found zero "park factor" or
"umpire" hits there, and its `HANDOFF.md` never mentions either). Unlike
WeatherPoll's Open-Meteo integration, this data structurally cannot be a
live resource; it has to be a fixture, sourced from confirmed real values.

`read_lines`/`read_file` silently return empty content on `index.html`
(2.3MB) — a known FIELD_Handoff limitation, re-confirmed this session for
both constants' line ranges — so the full tables were never directly
readable. Real values were instead cross-verified from smaller docs that
quote the actual function output verbatim:

- **Park factor** (5 real venues): Coors Field (+28% runs, HR factor 130,
  `[LAUNCH PAD]`) from a real Node `vm` extraction test in
  `docs/outbox/cc-dead-fallback-clause-2026-07-12.md`; Oriole Park at
  Camden Yards (+17% runs, +121 HR factor, `[LAUNCH PAD]`) from a
  user-provided screenshot of the live production app; Target Field
  (+4%), Citi Field (-5%), PNC Park (-4% runs, -7% HR factor) from real
  archived brief text quoted in
  `docs/outbox/cc-lead-specificity-scoring-2026-07-12.md`.
- **Ump watch** (4 real umpires): Little (40%), Visconti (50%), Tumpane
  (71%, past the real 0.65 `UMP_WATCH_THRESHOLD`) — all three from a real
  Node `vm` extraction test in
  `docs/outbox/cc-mlb-umpire-abs-sync-2026-07-10.md` against the actual
  committed `getUmpireABSRating`; Barber (78%, past threshold) from the
  same screenshot, real shape confirmed from
  `docs/CC-CMD-2026-07-01-umpire-weakness-zone.md`.

**A real architectural mismatch, surfaced and not papered over:** this
repo's own mock slate (`vite.config.js`) has exactly 3 MLB venues —
Citizens Bank Park (PHI), Yankee Stadium (NYY), Globe Life Field (TEX) —
and none of the 5 confirmed real park-factor venues overlap with any of
them. Rather than invent figures for the 3 teams this repo's slate
actually uses, both datasets ship as an explicitly-labeled reference
leaderboard ("confirmed real values, not today's slate"), the same
honesty pattern `weather.js`'s own comments already use for its partially
Drive-confirmed venue coordinates.

---

## What was built

`src/data/parkFactors.js` and `src/data/umpireWatch.js` — plain fixture
modules holding only the confirmed real values above, each with a header
comment tracing every number to its real source. No new UI mechanism:
both wire into `Stats.jsx`'s existing `LeaderRow`/`LeaderboardSection`
mechanism (proven by the win/loss-streak leaderboards already there),
appended as two more sorted, expandable leaderboard sections under the
MLB tab.

---

## CodeRabbit findings — 1 total, addressed

1. **Reference leaderboards nested inside the standings loading gate.**
   Park Factor and Ump Watch were rendered inside the same `<Show
   when={records().length}>` gating the win/loss streak sections — but
   both are static data with no dependency on `mlbStandings`, so they'd
   disappear whenever standings were loading, empty, or errored. Fixed:
   moved the two reference sections outside the `Show`, wrapped in a
   fragment, so they render unconditionally.

Flagged but not changed: a generic "Docstring Coverage 50% < 80%"
pre-merge warning. No function in this repo — `Stats.jsx`, `weather.js`,
or otherwise — uses docstrings; the established convention is comments
only for non-obvious rationale. Adding docstrings here would be
inconsistent with every other file in the codebase for a threshold
that doesn't reflect this repo's own style.

---

## Verification

`npm run build` clean. Playwright against the real dev server confirmed
both leaderboards render the correct real values, sorted descending
(Coors Field top of Park Factor, Barber top of Ump Watch), with the
`UMP WATCH` badge appearing only for the two umpires ≥65%. Expanded the
Coors Field row to confirm detail rows (`hr factor: 130`) render via the
existing `LeaderRow` expand mechanism. Confirmed Barber's missing
`record` (not visible in the source screenshot) renders "not confirmed"
rather than a fabricated fraction.

---

## Files changed

| Path | Status |
|------|--------|
| `src/data/parkFactors.js` | created |
| `src/data/umpireWatch.js` | created |
| `src/components/Stats/index.jsx` | modified — 2 new leaderboard sections, header comment updated, standings-gate fix |

---

## What this does NOT change

- No relay/backend changes — both datasets are pure client-side fixtures,
  matching the confirmed "no HTTP route exists" reality.
- The other 44 real umpire names in `UMPIRE_ABS_RATINGS` (only 4 have a
  confirmed rate/weakness this session) were not backfilled with invented
  numbers.
- Production's per-game scouting-report content, MLS's novel metrics, and
  the rest of `Stats.jsx`'s own deferred list remain deferred — this PR
  only resolved the park-factor/ump-watch item specifically requested.
