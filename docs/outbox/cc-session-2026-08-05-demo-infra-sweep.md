# CC Session Outbox — demo/infra component sweep

**Date:** 2026-08-05

---

## What was asked

"Write outbox first. Sweep the demo/infra components too" -- extending real verification coverage to
the 33 components the earlier "why should I care" audit classified as not applicable to a verdict
sentence (Solid.js reactivity/pattern demos, and pure UI chrome/infrastructure). Those 33 were never
edge-case-tested by either the verdict sweep or the edge-case closure pass, since neither touched them
on purpose.

The "why should I care" verdict pattern genuinely doesn't apply here -- a component demonstrating
`createComputed` vs `createEffect` flush order, or `indexArray` vs `mapArray` mount behavior, has no
ranked list or stat to translate into plain language. What DOES apply, and hasn't been done yet: the
same real-branch, real-bug-finding rigor just applied to the 28 verdict components -- exercising each
demo/infra component's own real interactive behaviors and edge cases, checking for crashes or incorrect
output, fixing anything real found.

---

## Scope: the 33 components

`CommandPalette, ComputedDemo, ContextDemo, ControlGroup, CreateRootDemo, DateBrowserTransition,
DayComparison, DeskModes, DrillDown, ErrorBoundaryDemo, FieldIdentity, Ground, IndexArrayDemo,
LazyBoundaryDemo, LocalNoteLayer, Multiview, PollDeltaFeed, Presence, PropsDemo, ReactivePerfPanel,
ReorderCost, ReplayDemo, ScoreFeed, ScoreTicker, SelectorDemo, SuspenseDemo, Tabs, TeamAffinitySync,
Toast, TransitionDemo, UndoStackDemo, WorkerBridgeDemo, WpSourceBadge`

Derived by diffing the full `src/components/*` list against every component already covered this session
(the 28-component verdict sweep, the 8 already-fine components, the 5 inherently-experiential
components, and the 4 original pattern-setters: LeverageIndex/ValueNight/ContradictionRadar/ForkPoint).

---

## What was done

Four parallel agents, each assigned 8-9 of the 33 components, actually DROVE each component's real
claimed interactive/reactive behavior in a real browser (Playwright against a shared dev server) rather
than checking for a verdict sentence: clicked buttons, typed inputs, triggered the specific Solid.js
mechanism each demo exists to prove, and for cross-tab components (Presence, TeamAffinitySync) used two
real browser contexts to actually exercise the BroadcastChannel protocol. Where a component's real data
path was network-gated by this sandbox (WpSourceBadge's host, LiveWpTicker, calling
statsapi.mlb.com/baseballsavant.mlb.com), the agent confirmed graceful degradation and verified the
component's own render logic directly instead of skipping it.

27 of 33 components held up exactly as documented -- no bugs. **6 real bugs found and fixed**, all in
the class this exercise exists to catch: a demo's own claimed behavior silently not being true, or a
counter/state genuinely wrong under real interaction:

- **DrillDown** -- an unguarded resource accessor call inside an eager `createMemo` re-threw a real
  fetch error synchronously, crashing the entire section instead of degrading through the component's
  own existing `<Show when={gameContext.error}>` path. Fixed with the same `resource.error ? undefined :
  resource()` guard already used elsewhere in this codebase (the exact bug class the CI Build Check's
  resource-safety guard exists to catch).
- **IndexArrayDemo** -- per-slot local mount counters could never increment past `×1` no matter how many
  real remounts occurred, because a local `createSignal(0)` resets on every remount -- directly
  contradicting the demo's own claim that "mapArray slots: mount count increments on every push."
  Replaced with parent-owned running totals per column, the only structure that can actually accumulate
  across unmount/remount cycles; verified live over 5 real pushes (mapArray total climbed 6→10 exactly).
- **PropsDemo** -- a `mergeProps` default was captured once via a plain property instead of a getter
  accessor, so `defaultVariant` silently stopped being reactive after the first render, contradicting
  the demo's own point about `mergeProps`.
- **ScoreTicker** -- a child element's own CSS animation (the live-status dot's `blink` keyframe) bubbled
  its `animationstart` event up through the parent track's listener, falsely inflating the marquee
  restart counter on every live game's blink, not just real marquee restarts.
- **Toast** -- the progress bar's `.progressTrack`/`.progressFill` CSS classes were never defined in the
  module.css, so the countdown bar rendered with no styling and was genuinely invisible despite the
  underlying countdown signal working correctly (confirmed live: `width:96%` on an unstyled div).
- **UndoStackDemo** -- the counter's log message re-applied the increment/decrement delta *after*
  `setCount` had already synchronously applied it, logging "counter → 2, 3, 4" for three real clicks
  from 0 instead of "1, 2, 3."

---

## Verification

All 6 fixes re-verified live against the real running app before being considered done (not just
re-read). Full production build clean after consolidating all 4 batches' work. A final fresh-page-load
regression sweep across all 7 top-level tabs found zero page errors.

---

## Confidence gate

**94/100 -- commit stands.**

33 components audited by actually driving their real behavior (not just reading code), with 6 real,
independently-reproduced-and-fixed bugs -- a genuine hit rate that justifies the exercise, not a rubber
stamp. The 6-point deduction: a small number of branches were confirmed as genuinely unreachable through
the UI rather than exercised (WorkerBridgeDemo's score-change branch, exhausted by the dev mock's own
scripted transition count before the observation window; WpSourceBadge's real network-backed data path,
sandbox-network-gated -- its own render logic was verified directly instead), and one subagent's final
text summary for batch 3 (PropsDemo/ScoreTicker) was truncated mid-report -- its actual code changes were
independently reviewed and verified sound directly from the diff rather than taken on the agent's word.

---

## Files changed

| Path | Status |
|------|--------|
| `src/components/DrillDown/index.jsx` | modified -- unguarded resource accessor crash |
| `src/components/IndexArrayDemo/index.jsx` | modified -- non-functional mount counters |
| `src/components/PropsDemo/index.jsx` | modified -- non-reactive mergeProps default |
| `src/components/ScoreTicker/index.jsx` | modified -- animationstart event bubbling |
| `src/components/Toast/Toast.module.css` | modified -- missing progress bar CSS |
| `src/components/UndoStackDemo/index.jsx` | modified -- off-by-one log message |
| `docs/outbox/cc-session-2026-08-05-demo-infra-sweep.md` | this doc -- updated with real results |
