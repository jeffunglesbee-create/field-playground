# CC Session Outbox — Novel SolidJS Playground Patterns
**Date:** 2026-07-25  
**Branch:** main  
**Commit:** 291cb01

---

## What was built

Three new playground components, each answering a specific SolidJS question
that had not been exercised anywhere in this repo.

---

### 1. ErrorBoundaryDemo (`src/components/ErrorBoundaryDemo/`)

**Question answered:** Are `<ErrorBoundary>` and `resource.error` two
genuinely separate error paths, or does one subsume the other?

**Answer:** Fully separate. ErrorBoundary catches synchronous throws that
propagate up through the reactive owner chain — throws inside `createMemo`,
`createEffect`, computed derivations. `resource.error` captures async
rejections, surfacing them as reactive state that the component reads with
`Show when={resource.error}`. An async rejection never reaches ErrorBoundary.
A sync throw inside a memo never surfaces as resource.error.

**What the demo shows:**
- Path A: `createMemo` that throws when "armed". ErrorBoundary shows fallback;
  "reset" button calls `reset()` and clears the signal, bringing the memo
  back to a non-throwing state.
- Path B: `createResource` fetching `/this/route/does/not/exist` — guaranteed
  404. Error shows via `resource.error` as readable state; never caught by
  any boundary.

---

### 2. DrillDown (`src/components/DrillDown/`)

**Question answered:** Can a resource source from another resource's resolved
value without racing on undefined between loading states?

**Answer:** Yes. `createMemo` over Resource A's value returns `undefined`
while A is loading and a stable string once A resolves. Resource B treats
`undefined` source as "don't fetch yet." When A resolves, B's source becomes
non-undefined, triggering B's fetch. When `currentDate` changes, A re-fetches;
the memo immediately returns `undefined`; B drops to idle again. No stale
fetch, no race.

**What the demo shows:**
- Resource A: `ambientData` (module-level, already in repo) — fetches
  today's editorial picks
- `useTopPickId()` memo: extracts the top pick's ESPN game ID from A's value,
  strips `"espn:"` prefix, returns undefined while A is loading
- Resource B: `createResource(topPickId, fetchGameContext)` — idles when
  topPickId is undefined, fetches context endpoint when topPickId resolves
- Displays venue, streams, and moneyline opening odds from the context game
  object

---

### 3. TransitionDemo (`src/components/TransitionDemo/`)

**Question answered:** Does `startTransition` actually suppress the Suspense
fallback during navigation, and does the signal update still propagate?

**Answer:** Yes on both. `startTransition` marks the update as deferred and
tells Suspense not to replace current content with its fallback. Old content
stays visible while the new fetch is in flight, then swaps atomically. The
signal write does propagate — the new content eventually appears, proving the
update was not lost, only deferred relative to the Suspense boundary. Plain
`setDate(next)` immediately replaces current content with the skeleton fallback.

**Critical implementation detail:** The resource accessor `data()` must be
read inside a child component rendered inside `<Suspense>`. Reading it at the
top level of the parent component doesn't trigger the suspension mechanism.
`ReportText` is a separate function component for exactly this reason.

**What the demo shows:**
- Independent `[date, setDate]` signal — no effect on shared `currentDate`
- Four navigation buttons: "‹ batch", "‹ transition", "transition ›", "batch ›"
- Suspense fallback labels itself: "Suspense fallback showing — this means
  old content was NOT kept" — makes the distinction unambiguous visually
- `lastMode` pill shows which navigation type was last used

---

## Files changed

| File | Status |
|------|--------|
| `src/components/ErrorBoundaryDemo/index.jsx` | created |
| `src/components/ErrorBoundaryDemo/ErrorBoundaryDemo.module.css` | created |
| `src/components/DrillDown/index.jsx` | created |
| `src/components/DrillDown/DrillDown.module.css` | created |
| `src/components/TransitionDemo/index.jsx` | created |
| `src/components/TransitionDemo/TransitionDemo.module.css` | created |
| `src/App.jsx` | modified — 3 new imports, 3 new sections |
| `src/App.module.css` | modified — 3 new section class names |

Build: clean, 49 modules, no warnings.

---

## What this does NOT include

- No new data model changes
- No shared signal modifications (TransitionDemo's date is fully isolated)
- No changes to existing components (DrillDown reads `ambientData` but does
  not write to it)
- History's MultiDayStreak and the standalone MultiDayStreak remain unchanged
