# CC Session Outbox — Gamecard-Derived Mechanisms

**Date:** 2026-07-26
**PR:** jeffunglesbee-create/field-playground#7 (merged)
**Commit:** 772ff39 (squash merge to main)

---

## What was asked

A screenshot of production's dense gamecard (`+MULTIVIEW`, `▼ Standings`,
a sort control, `MY TEAM`/`YOUR TEAM`, weather, streaming price, park-factor
chips) with the question: "how can this be optimized for playground while
being rooted in solid.js?" Recommendation given before building: don't clone
the card visually (production already deliberately prioritizes teams-first
column layout, discussed in an earlier session), mine it instead for the
SolidJS mechanisms it implies that this repo hadn't tested yet. Five items
were identified as genuinely novel across two rounds — three approved
first, two more ("MY TEAM/YOUR TEAM" and weather) approved after a follow-up
question about the remaining screenshot elements.

---

## What was built

### Multiview — real multi-select at real scale via createSelector

Two side-by-side columns over the same real game list, each with its own
selection `Set`: naive subscribes every row directly to the whole selection
signal; selector uses `createSelector` with a custom Set-membership
predicate. Real per-row fire counters make the difference a number.

**A claim worth getting exactly right, not assumed:** the common description
of `createSelector` as "O(1) lookup" doesn't hold up against the actual
source. Read `node_modules/solid-js/dist/dev.js` directly — the internal
computation is `for (const [key, val] of subs.entries()) if (fn(key, v) !==
fn(key, p))`, an O(n) scan over every subscribed key on **every** source
change, for both the default single-value form and this custom predicate.
What `createSelector` actually minimizes is the *output* — only keys whose
predicate result flipped get marked stale — not its own bookkeeping cost.
Verified via headless test with correctly-scoped selectors (an initial pass
used a broken CSS selector, `[class*="column"]`, which also matches
`.columns` and `.columnLabel` — caught before trusting the result): naive
+8 fires per click (every row), selector +1 (only the toggled row).

### StandingsDrawer — lazy per-game join, zero new fetch

Per-game collapsible row joining `deskStore`'s real games against the same
already-live `mlbStandings`/`mlsStandings` resources Seasons and Stats
already hold, by team name. Computed only when a row is expanded — Solid
memos are inherently lazy, nothing needed gating beyond that. Required
fixing two real fixture mismatches found via testing: `NY Yankees`/`NY Mets`
in the context mock vs `New York Yankees`/`New York Mets` in the earlier
standings mock, and Texas Rangers missing from the AL West division
entirely (the flagship hou-tex demo game would have shown "not found" for
half the matchup). A WNBA game correctly falls through to an honest "no
standings source wired" message rather than a silent blank.

### ReorderCost — does keyed `<For>` move nodes or remount on reorder?

Sorts the real game list by time/alphabetical/score-margin/sport, plus a
shuffle button, with real mount/compute counters per row (same pattern as
ReactivePerfPanel, but testing a genuinely different question — everything
measured before this, including ReactivePerfPanel, tested value-patch cost
on stable objects, never *position* changes on those same stable
references). Verified: total mounts stayed flat at 8 across alphabetical
and score-margin re-sorts while the visible row order changed — `<For>`
moves existing DOM nodes to their new position rather than rebuilding them.

### TeamAffinitySync — two distinct concurrent identities, not one converged value

`MY TEAM` (local, localStorage-backed) merged live with `YOUR TEAM` (remote,
heard over its own `BroadcastChannel`) — deliberately kept as two separate
values rather than reduced to one, unlike relay.js's date sync where every
tab is expected to converge. A request/reply protocol lets a late-opening
tab learn an already-set pick (BroadcastChannel has no history/replay),
mirroring Presence's join→heartbeat-reply solution for existence, applied
here to a value.

**A real race found via 3-tab testing, not assumed correct from the code:**
with 3+ tabs open, every tab replies to a `request`, and a tab with nothing
set replying *after* a tab with a real pick clobbers the correct value back
to null purely on arrival order. Fixed by only replying (and only
broadcasting on change) when there's something meaningful to say. Verified
before/after: before the fix, a late-opening empty tab reset an established
peer's known pick to "no other tab has set one yet"; after, it doesn't.

**CodeRabbit found the other half of this exact bug** on PR #7 review: the
initial fix only applied the "stay silent when empty" principle to the
`request`-reply path, not the primary `createEffect` that broadcasts on
every `myTeam()` change — which also fires unconditionally on a fresh tab's
first run (`myTeam()===null`). Fixed the same way, re-verified with the
same 3-tab test.

### WeatherPoll — the first independently-paced poll loop in this repo

Its own resource, its own 45-second `setInterval`, running alongside
`deskData`'s shared 15s loop rather than sharing it — proves two
independently-timed `createResource` poll loops coexist without
interfering. Real venues matching the context mock's own games; mock temps
drift slightly per request so the independent cadence is provable, not
just asserted.

---

## CodeRabbit findings (3 total, PR #7)

1. **`data/teamAffinity.js` (Major, confirmed)** — the primary broadcast
   effect had the same unconditional-null-broadcast bug already fixed in
   the request-reply path. Fixed, re-verified with a real 3-tab test.
2. **`components/WeatherPoll/index.jsx` (Minor)** — copy said "today's
   slate" but `weatherData` follows the shared `currentDate`, which
   changes on navigation. Corrected to "the selected date's slate."
3. **`data/weather.js` date validation/encoding (Minor) — not applied.**
   Checked all three `setCurrentDate` call sites in this repo (DeskCard's
   real `Date`-object arithmetic, CommandPalette's regex-validated `go to`
   command, cross-tab sync of an already-validated value) — `currentDate`
   is guaranteed well-formed by construction throughout this codebase, the
   same trust boundary all six of relay.js's existing fetchers already
   rely on without incident. Applying the guard to only this one new
   fetcher would have been inconsistent with an established repo-wide
   pattern rather than fixing a real gap — skipped with that reasoning
   posted on the PR rather than applied blindly.

---

## Files changed

| Path | Status |
|------|--------|
| `src/components/Multiview/index.jsx` | created |
| `src/components/Multiview/Multiview.module.css` | created |
| `src/components/StandingsDrawer/index.jsx` | created |
| `src/components/StandingsDrawer/StandingsDrawer.module.css` | created |
| `src/components/ReorderCost/index.jsx` | created |
| `src/components/ReorderCost/ReorderCost.module.css` | created |
| `src/components/TeamAffinitySync/index.jsx` | created |
| `src/components/TeamAffinitySync/TeamAffinitySync.module.css` | created |
| `src/components/WeatherPoll/index.jsx` | created |
| `src/components/WeatherPoll/WeatherPoll.module.css` | created |
| `src/data/teamAffinity.js` | created |
| `src/data/weather.js` | created |
| `src/App.jsx` | modified — 5 imports/sections, `initTeamAffinitySync()` added to onMount |
| `src/App.module.css` | modified — new section class names |
| `vite.config.js` | modified — fixed MLB team-name mismatches (NY Yankees/NY Mets), added missing Texas Rangers, added MLS teams matching real context-mock games, added weather mock + route |

Build: clean, both standard (117 modules) and single-file artifact
(116 modules) builds. Full app-wide headless sweep: 54 sections render,
zero console errors.

---

## What this does NOT change

- No modifications to DeskCard's actual production render path — all five
  are additive, parallel instrumentation/mechanism surfaces over the same
  real data, not patches to production code.
- No schema or data model changes beyond the vite.config.js mock fixture
  corrections (which fixed real, previously-invisible name mismatches, not
  new shapes).
