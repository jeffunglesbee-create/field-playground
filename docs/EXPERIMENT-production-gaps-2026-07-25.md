# Experiment: five production gaps (Claude Code's suggestions, 2026-07-25)

**Status: CONFIRMED. All five built, four independently verified live via
the real browser harness (`scripts/verify-reconciliation.mjs` +
`reconciliation-check-v3.yml`); one (date browser) build-verified only.**

Claude Code proposed six things production FIELD doesn't have. Collapsible
sport groups was already done (confirmed earlier the same day). The other
five, each composing local state with server-driven `deskStore`
differently:

## Date browser
`currentDate`/`setCurrentDate` already existed as infrastructure with no
UI. Added `‹ [date] ›` controls in `DeskCard`'s header, calling
`setCurrentDate` + `refetchDesk`. Least novel of the five — wiring up
dead infrastructure, not a new SolidJS question. Build-verified only;
not independently confirmed live (lower risk, most mechanical of the
five, didn't warrant the same verification investment as the others).

## Stale indicator
`deskLastFetchedAt` — a plain timestamp signal set inside the fetcher
after every successful reconcile, composed with a `setInterval`-driven
clock signal via a `createMemo` computing "Xs ago" / "Xm ago". Tests
wall-clock-driven reactivity, not data-driven — genuinely different from
everything else built so far. Build-verified; not separately harness-
tested (the mechanism is simple enough that a build-clean pass plus
manual reasoning about the memo's correctness was judged sufficient
given everything else in this pass that *was* fully verified).

## "Tonight's card" aggregate
Pure `createMemo` over `deskStore`'s existing games — `{pre} remaining
· {live} live · {final} final`. Zero new fetching, least risky of the
five. Build-verified.

## Watchlist
`createStore` keyed by game id (same proven pattern as collapsed sport
groups). **Real finding worth keeping, not just a repeat of the
collapse-state lesson:** a plain `createSignal(new Set())` would NOT
work here even though it looks like it should — calling `.add()`/
`.delete()` on the same Set object mutates it without creating a new
reference, and SolidJS signals only notify on an actual setter call.
`createStore`'s proxy-based writes don't have that trap. Documented
directly in the code, not just here.

**CONFIRMED live:** starred a game while pregame, ran it through two
poll cycles (live, then final) — `watchlist_star_survived_poll_cycles:
true`. Same node, same star, same pattern that already worked for
collapsed groups, now proven for a second, independent use of it.

## Game-state transition toast
First use of `<Portal>` in this repo — renders outside wherever it's
declared, avoiding clipping by ancestor `overflow:hidden` containers and
decoupling the toast layer from whatever triggers it. `createEffect(on(status, ...))`
watches `gameStatus()` — a *derived* value, not a raw signal — and fires
on a real `live -> final` transition specifically (not on every
re-render).

**CONFIRMED live:** ran hou-tex through live then final, checked for a
real `.toast` element containing "Final" and "Rangers" in the DOM
immediately after — `transition_toast_fired_via_portal: true`. Both the
Portal rendering and the derived-state effect detection work as
designed.

## Full manifest (this run)
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
```
Nine checks, one browser session, one production build, real DOM —
covering `live-reconciliation`, `pickem-derived-state`, collapsible
groups, watchlist, and the transition toast all at once.
