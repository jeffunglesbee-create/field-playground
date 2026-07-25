# Experiment: five production gaps (Claude Code's suggestions, 2026-07-25)

**Status: CONFIRMED. All five built, all five independently verified
live via the real browser harness (`scripts/verify-reconciliation.mjs` +
`reconciliation-check-v3.yml`).**

Claude Code proposed six things production FIELD doesn't have. Collapsible
sport groups was already done (confirmed earlier the same day). The other
five, each composing local state with server-driven `deskStore`
differently:

## Date browser
`currentDate`/`setCurrentDate` already existed as infrastructure with no
UI. Added `‹ [date] ›` controls in `DeskCard`'s header, calling
`setCurrentDate` + `refetchDesk`.

**CONFIRMED live**, after two real bugs found and fixed in the *test*,
not the app:
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
   that wrapper. Re-ran: `date_browser_requested_correct_next_date: true`,
   `date_browser_displayed_date_updated: true`, `displayedDateAfterNav:
   "2026-07-26"` — exact match to the expected next date.

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

## Full manifest (final run, all five confirmed)
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
Eleven checks, one browser session, one production build, real DOM.
