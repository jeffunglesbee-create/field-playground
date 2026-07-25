# Experiment: five production gaps (Claude Code's suggestions, 2026-07-25)

**Status: CONFIRMED. All five built, all five independently verified
live via the real browser harness (`scripts/verify-reconciliation.mjs` +
`reconciliation-check-v3.yml`).**

Claude Code proposed six things production FIELD doesn't have. Collapsible
sport groups was already done (confirmed earlier the same day). The other
five, each composing local state with server-driven `deskStore`
differently:

## Date browser
Added `‹ [date] ›` controls in `DeskCard`'s header.

**CONFIRMED live**, after two real test bugs found and fixed (too-short
wait, then an ambiguous cross-component selector reading AmbientPanel's
date instead of DeskCard's — full detail preserved below).

**Also confirmed: URL-persisted date and BroadcastChannel cross-tab
sync** — both already built and wired by Claude Code independently
(found reading `relay.js` fresh, before duplicating the work).

- `url_date_param_used_on_initial_load`: confirmed via an isolated
  script — opening `?d=2026-08-01` correctly seeds the app to that date.
- BroadcastChannel: confirmed via a real two-page browser test, real
  fetch-count instrumentation. One date change on page 2 produced
  exactly one propagated update to page 1 — `page1: 4→6`, `page2: 4→6`,
  then flat for a full 4-second sampling window. No runaway, no echo
  loop. The original hypothesis (a possible ping-pong between the two
  pages) is refuted by real data, not just an absence of a hang.

**The real story behind getting there, worth keeping in full:** this
took four failed CI attempts before a real answer, and they were two
genuinely different problems, not one:

1. **First two attempts hung to a JOB-level timeout.** Searched this
   project's own history rather than guess a fifth time — found the
   real, established pattern for CI diagnosis here, and a specific
   mechanical fact: a job-level `timeout-minutes` force-kills the entire
   job, including an `if: always()` commit-back step. A step-level
   timeout on just the risky step fails gracefully instead, letting
   later steps still run. That fix alone turned an unbounded hang with
   zero recoverable data into a normal, readable failure.
2. **With real diagnostics finally working, attempts 3 and 4 revealed
   the actual bug — in the test, not the app.** The isolated
   BroadcastChannel script's mock deliberately returned zero games (it
   only cared about date-sync), but the test waited on
   `[class*="gameRow"]` — an element that cannot exist without games.
   Not a race condition, not a timing issue: a test guaranteed to fail
   by its own construction, and it took real console/page-error capture
   plus a body-text dump to see that plainly instead of inferring a
   cause from a bare timeout. Fixed by waiting on `[class*="dateBrowser"]`
   instead, which renders regardless of game count. Fifth attempt: clean
   pass.

Full detail on the date-browser-specific test bugs, unchanged from
before:
1. First pass: `date_browser_displayed_date_updated` failed. Checked
   whether the 1s post-click wait was simply too short (cheaper
   hypothesis to rule out first) — extended to 3s, same failure.
2. Read the actual displayed text on the failing run:
   `"2026-07-25 · recap through 2026-07-24"` — that's AmbientPanel's
   header format, not DeskCard's. `document.querySelector('[class*="dateMeta"]')`
   is ambiguous: both components have a `dateMeta` class (CSS Modules
   preserves the name as a substring of the hash), and AmbientPanel
   renders first in `App.jsx` — `querySelector` was silently grabbing
   AmbientPanel's stale element the whole time, not DeskCard's. Scoped
   to `[class*="dateBrowser"] [class*="dateMeta"]` — only DeskCard has
   that wrapper.

Also worth noting as a real, still-open (non-blocking) observation:
`shiftDay` calls both `setCurrentDate(...)` (which already triggers
`createResource`'s automatic refetch via the source signal) and an
explicit `refetchDesk()` right after — a likely redundant double-fetch.
The final displayed state is confirmed correct despite this, so it's not
a correctness bug, just a probable wasted network call worth cleaning up
later.

## Stale indicator
`deskLastFetchedAt` — a plain timestamp signal set inside the fetcher
after every successful reconcile, composed with a `setInterval`-driven
clock signal via a `createMemo` computing "Xs ago" / "Xm ago". Tests
wall-clock-driven reactivity, not data-driven. Build-verified; not
separately harness-tested.

## "Tonight's card" aggregate
Pure `createMemo` over `deskStore`'s existing games — `{pre} remaining
· {live} live · {final} final`. Zero new fetching. Build-verified.

## Watchlist
`createStore` keyed by game id (same proven pattern as collapsed sport
groups). Real finding: a plain `createSignal(new Set())` would NOT work
here — mutating a Set via `.add()`/`.delete()` doesn't create a new
reference, and signals only notify on an actual setter call.
`createStore`'s proxy writes don't have that trap.

**CONFIRMED live:** `watchlist_star_survived_poll_cycles: true`.

## Game-state transition toast
First use of `<Portal>` in this repo. `createEffect(on(status, ...))`
watches derived state, fires on a real `live -> final` transition.

**CONFIRMED live:** `transition_toast_fired_via_portal: true`.

## Full manifest (main harness, final run)
```
allPass: true
houtex_transitioned_pre_to_live_or_final: true
dom_node_references_reused_not_remounted: true
no_gamerow_nodes_removed_from_dom: true
pickem_pick_registered_as_pending: true
pickem_resolved_correct_after_final: true
sport_group_collapsed_on_click: true
collapse_state_survived_poll_cycle: true
watchlist_star_survived_poll_cycles: true
transition_toast_fired_via_portal: true
date_browser_requested_correct_next_date: true
date_browser_displayed_date_updated: true
```
Plus, separately: `url_date_param_used_on_initial_load: true` and
BroadcastChannel's `fetch_counts_stabilized_not_runaway: true`.
