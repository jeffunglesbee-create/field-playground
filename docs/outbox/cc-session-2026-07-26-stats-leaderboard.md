# CC Session Outbox — Stats Leaderboard Surface

**Date:** 2026-07-26
**PR:** jeffunglesbee-create/field-playground#6 (merged)
**Commit:** 97f536f (squash merge to main)

---

## What was asked

A screenshot from a separate FIELD (jubilant-bassoon) session surfaced a
codex entry (`playground-stats-surface-gap`) noting production's real
Stats tab (`renderStatsSection`) had never been reproduced in this
playground, with an explicit warning attached: "this session repeatedly
proved that assuming a data shape from a name is wrong... read the real
renderStats and the bottom-sheet CC-CMD first." The user's own ask, more
compactly: "Stats tab needs to be tested in playground while being rooted
in solid.js. Also day comparison and pick 'em need the same tab structure
as seasons."

---

## What was verified before building anything

Read directly from the production repo via FIELD_Handoff (not from
memory, not guessed from the name):

- `src/legacy/field.js`'s `renderStatsSection()` (found via CODE_MAP.json
  function index — `index.html`/`field.js` are too large for direct
  `read_file`/`read_lines`, both returned empty content despite reporting
  a real byte size).
- `docs/CC-CMD-2026-07-19-bottom-sheet-stats-reconciliation.md` — confirms
  the real Stats tab has TWO distinct content shapes: cross-game
  leaderboards (top-8, sorted by a computed metric) and a separate
  "Today's Games" per-game sub-section (scouting report, standings,
  milestone alerts, BSD pitch, comeback probability) that deliberately
  does NOT force per-game data into the leaderboard format.
- `docs/CC-CMD-2026-07-19-mls-novel-metrics.md` — confirms the real MLS
  leaderboard fields (`second_assists`, `shots_at_goal_inside_box`,
  `counter_attacks`, etc.) and their relay endpoint
  (`/mls/stats/team-metrics`).
- `probe_relay_route` confirmed `/mls/stats/team-metrics` is NOT on
  FIELD_Handoff's self-probe allow-list — unverifiable from here, so not
  built against.

Given the per-game scouting-report content and MLS's real novel metrics
both depend on endpoints/data not confirmed reachable from
field-playground, building either would have repeated the exact mistake
the codex entry warned against. Scope was narrowed to what IS verifiably
real: the same `wcStandings`/`mlbStandings`/`mlsStandings` resources
Seasons already proves live, recomposed into a different shape.

---

## What was built

### Stats component — cross-game leaderboards

Tabbed (MLB / MLS / World Cup), each tab flattening the SAME standings
resources Seasons already uses across their own per-division/conference/
group boundaries into one ranked, cross-game leaderboard — a `createMemo`
composition genuinely new to this repo, not new or fabricated data:

- MLB: longest active win streaks and losing streaks, ranked across all
  6 divisions (real field: `streak.streakCode`, parsed as `/^([WL])(\d+)$/`).
- MLS: goal-difference leaders across Eastern + Western combined (real
  field: `goals_difference`).
- World Cup: goal-difference leaders across all groups combined (real
  field: `gd`).

Each row is click-to-expand, showing the team's full real record fields
already fetched (no new request). Header note honestly discloses the
narrowed scope (leaderboard-recomposition only, not the full production
surface) rather than silently presenting it as feature-complete.

### A real, previously-unnoticed dev-testing gap, fixed as a side effect

`vite.config.js`'s mock relay never covered `/wc/standings`,
`/mlb-stats/standings`, or `/mls/stats/.../standings` — only
`/analytics/newspaper/*`, `/context/date/*`, and `/journalism/brief`.
Since `RELAY_BASE` is `''` in dev, Seasons' three standings resources have
always 404'd locally, meaning **Seasons has never actually been
exercisable against real-shaped data in this sandbox before now** — every
prior session's dev-server verification of Seasons was implicitly testing
only its error-fallback path. Added mock handlers matching exactly the
field names Seasons already parses (not new shapes — the ones already
relied upon). Required to test Stats at all; incidentally unblocks real
Seasons testing too.

---

## A concurrent-session collision, and how it was resolved

While this branch was independently building a shared `Tabs` primitive
and retrofitting `DayComparison`/`PickEm` to it (the second half of the
same user ask), another session did the identical work directly on
`main` — and did it better: proper `role="tablist"`/`aria-selected`
semantics, `DayComparison`'s `Both` side-by-side view kept as a third tab
rather than replaced (preserving the actual thing that component tests —
two independent `createDayContext` resources alive simultaneously),
`PickEm`'s tabs showing a live game-count badge per sport.

Rather than opening a PR that would conflict with or duplicate
already-merged work, this branch was reset onto current `main`
(`git reset --hard origin/main`) and only the genuinely new,
non-duplicated work — the Stats component and its standings mocks — was
rebuilt on top and shipped as PR #6.

---

## Files changed (PR #6, on top of the other session's already-merged Tabs/DayComparison/PickEm work)

| Path | Status |
|------|--------|
| `src/components/Stats/index.jsx` | created |
| `src/components/Stats/Stats.module.css` | created |
| `src/App.jsx` | modified — import + section, between Seasons and Ground |
| `src/App.module.css` | modified — `.stats` section class |
| `vite.config.js` | modified — added `/wc/standings`, `/mlb-stats/standings`, `/mls/stats/competitions/.../standings` mock handlers |

Build: clean, both standard (105 modules) and single-file artifact
(104 modules) builds. Full app-wide headless sweep: 49 sections render,
zero console errors.

---

## What this does NOT change

- Does not reproduce production's per-game "Today's Games" scouting-report
  sub-section — no confirmed real data source for it from this playground.
- Does not reproduce MLS's real novel metrics (second-assist share,
  shot-selection quality, counter-attacks, cross accuracy) —
  `/mls/stats/team-metrics` is not on FIELD_Handoff's self-probe
  allow-list, unverifiable from here.
- No modifications to DeskCard, or to the other session's Tabs/
  DayComparison/PickEm implementations (fully adopted as-is).
