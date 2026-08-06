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

## Follow-up (2026-08-06): CI-as-proxy on the two disclosed unreached branches

"Use GitHub Actions runner to follow up on those branches." Two real CI probes, one per gap:

**`scripts/probe-live-wp-ticker-real-savant-path.mjs`** -- real production build, real `vite preview`,
real network to `statsapi.mlb.com`/`baseballsavant.mlb.com` (sandbox-blocked from chat, reachable from
CI). **Result: honest empty state, not the SAVANT badge.** "No live MLB games right now" -- confirmed
network-healthy (zero fetch errors, zero page errors, no stuck loading state), but no real MLB game
happened to be live at the moment this ran, so the SAVANT-badge branch itself still wasn't directly
observed. This is a real-world timing fact this probe cannot control, not a code defect -- the honest
outcome either way was the point, and the network path is now confirmed reachable, which the original
sweep could not check at all. Re-running during real live MLB hours is the only way to see the badge
itself render.

**`scripts/probe-worker-bridge-score-transition.mjs`** -- fresh, isolated `vite` dev server (nothing
else polling `/context/date`), watched for up to 150s (10x the mock's 15s poll interval) as
WorkerBridgeDemo's own poll counter climbed to 13. **Result: still no "score" change row observed, even
in isolation.** This does NOT confirm the sweep's original hypothesis (shared-counter contamination from
4 concurrent test batches) -- it rules out a large part of it, since a single isolated session had the
same real problem. Read `src/workers/reconcileWorker.js` directly: its score-diff logic is correct on
inspection (compares `home_score`/`away_score` by matching real game `id`). The likely real explanation,
not yet confirmed: `vite.config.js`'s scripted transition ladder is keyed to a single shared
`contextRequestCount` closure variable incremented by ANY `/context/date` request, and the real dev
startup burst (3 near-simultaneous requests at page mount, per that file's own comment) plus however many
real polls elapse before WorkerBridgeDemo's own `seeded` flag consumes its first baseline poll could
plausibly land past the real request-5-to-8 transition window before WorkerBridgeDemo's own diffing ever
starts comparing two real snapshots that straddle it. **Not fixed -- flagged honestly as still open,**
since confirming that exact mechanism needs added diagnostics (e.g., surfacing the raw request count),
not a guess dressed up as a fix.

---

## Confidence gate (updated)

**95/100.** The LiveWpTicker/WpSourceBadge gap is now confirmed network-healthy via a real CI run against
the real hosts, even though the specific SAVANT-badge branch still awaits a real live game to observe --
a real-world timing constraint, disclosed rather than hidden. The WorkerBridgeDemo gap is NOT closed: the
follow-up CI run surfaced a real, more specific puzzle (still unobserved even in isolation) rather than
confirming the original theory, and is reported as genuinely open rather than claimed fixed.

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
| `scripts/probe-worker-bridge-score-transition.mjs`, `.github/workflows/worker-bridge-score-transition-probe.yml` | new -- follow-up probe, result: still open |
| `scripts/probe-live-wp-ticker-real-savant-path.mjs`, `.github/workflows/live-wp-ticker-real-savant-path-probe.yml` | new -- follow-up probe, result: network-healthy, badge branch awaits a real live game |
| `outbox/worker-bridge-score-transition-probe-2026-08-06T00-01-49-199Z.txt`, `outbox/live-wp-ticker-real-savant-path-probe-2026-08-06T00-02-06-718Z.txt` | new -- real CI results |
| `docs/outbox/cc-session-2026-08-05-demo-infra-sweep.md` | this doc -- updated with real results |
