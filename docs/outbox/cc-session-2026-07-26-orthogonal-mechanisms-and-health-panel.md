# CC Session Outbox — Orthogonal Mechanism Demos + Health Panel

**Date:** 2026-07-26
**PR:** jeffunglesbee-create/field-playground#4 (merged)
**Commit:** 668bf1536 (squash merge to main)

---

## What was built

Five more SolidJS playground components, each exercising a mechanism not
previously demonstrated in the repo, plus a `HealthPanel` that runs the same
underlying checks unattended instead of waiting for a button press.

### 1. UndoStackDemo — `createUndoableSignal` (custom middleware over `createSignal`)

**Question:** Can undo/redo be layered on top of `createSignal` as reusable
middleware, with independent stacks per instance and a single keyboard
shortcut routed to whichever instance was last touched?

**Answer:** Yes. `src/data/undoable.js`'s `createUndoableSignal` wraps a
signal with bounded undo/redo stacks. Two independent instances (a counter, a
text field) prove non-interference — undoing the counter never touches the
text field's history. A window-scoped Ctrl+Z/Ctrl+Shift+Z listener is scoped
to the component's own DOM subtree (`ref` + `Node.contains()`) so it doesn't
hijack undo shortcuts from other text inputs on the page.

### 2. WorkerBridgeDemo — Web Worker → signal bridge

**Question:** Can SolidJS's reactive graph be driven from outside the main
thread without breaking fine-grained updates?

**Answer:** Yes — the only channel is `postMessage`, and the only thing that
has to work is a plain `setDiff(data)` call in `onmessage`. A real Web Worker
(`src/workers/reconcileWorker.js`, bundled via `?worker&inline` so the
standalone artifact build doesn't need a second network request) diffs
cloned game snapshots off-thread and reports back timing + changes.

### 3. PollDeltaFeed — events derived from snapshot sequences, not current state

**Question:** Does anything in this repo remember that a transition
happened, once the next render has already settled on the new state?

**Answer:** No — every other consumer reacts to current state only. This
derives a first-class event log ("went live", "score changed X→Y",
"finalized") from the sequence of poll snapshots, module-level so it survives
component unmount.

### 4. ReplayDemo — recorded poll sequence driven by synthetic time

**Question:** Is SolidJS's reactive graph tied to the wall clock, or can it
be driven equally well by a scrubber replaying recorded gaps × 1/speed?

**Answer:** Equally well — `reconcile()` doesn't know or care whether the
store it's updating is fed by a live fetch or a scrubber; a write is a
write. Drives an independent local store through the session's actual
recorded poll responses (captured in `relay.js`'s `pollRecordings`).

### 5. LatencyHistogram — relay fetch timing, instrumented app-wide

**Question:** Can request latency be observed for every fetcher in the app
with zero per-component wiring?

**Answer:** Yes — `src/data/fetchTiming.js` wraps `window.fetch` globally
once; every `createResource` fetcher (ambient, desk, standings, journalism,
day-context, multi-date-trend) flows through the same instrumented path with
no changes to any of them.

### HealthPanel — the same primitives, run unattended

**Rationale:** every other component in this repo needs a human to press a
button to prove its mechanism works (throw, trigger fail, push item) — fine
for a demo, wrong for a health check. `HealthPanel` runs three of these
mechanisms unattended on mount and reports pass/fail without any
interaction: reactive root disposal (`createRoot` + `onCleanup`), an
`ErrorBoundary` catch (a `createMemo` that throws once per mount), and a real
Web Worker round-trip (reusing `reconcileWorker.js`). It also surfaces two
live metrics with no pass/fail semantics of their own: fetch health (from
`fetchTiming`'s samples) and poll freshness (seconds since `deskStore`'s
last successful relay poll). Mounted as the first section in `App.jsx`.

---

## CodeRabbit findings addressed (9 total across 2 review rounds)

1. `LatencyHistogram` — p95 index used `Math.floor(n * 0.95)` (selects the
   max at exact bucket boundaries); corrected to nearest-rank
   `Math.ceil(n * 0.95) - 1`.
2. `PollDeltaFeed` — missing reseed-on-date-change; navigating DeskCard's
   date browser diffed an unrelated slate against the old one.
3. `WorkerBridgeDemo` — same reseed-on-date-change bug (found proactively,
   not flagged) + a second bug: `lastSnapshot` held live store proxy
   references, so `reconcile()` patching objects in place silently corrupted
   the "previous" snapshot before the next diff. Fixed by cloning to plain
   objects at capture time.
4. `ReplayDemo` — playback scheduling was one step out of phase: `play()`
   applied record 0 then immediately jumped to record 1 with 0ms delay, so
   every recorded gap landed on the *following* transition instead of the
   one it belonged to.
5. `ReplayDemo` — scrub `<input type="range">` had no accessible name;
   added `aria-label` + `aria-valuetext`.
6. `UndoStackDemo` — missing `aria-label`s on undo/redo/counter buttons and
   a label/input association for the text field.
7. `UndoStackDemo` — buttons updated `active` only on click, so tabbing to a
   control and pressing Ctrl+Z before clicking could route the shortcut to
   the wrong field; added matching `onFocus` handlers.
8. `UndoStackDemo` — the keyboard listener was attached to `window`,
   intercepting Ctrl+Z from every other text input on the page; scoped to
   the component's own subtree via `ref` + `Node.contains()`.
9. `HealthPanel` — `worker.onerror` marked the check failed but left the
   worker running until unmount, unlike the timeout and `onmessage` paths;
   added `worker.terminate()`.

All verified via headless Playwright testing, not applied as blind diffs.

---

## Files changed

| Path | Status |
|------|--------|
| `src/data/undoable.js` | created |
| `src/components/UndoStackDemo/index.jsx` | created |
| `src/components/UndoStackDemo/UndoStackDemo.module.css` | created |
| `src/workers/reconcileWorker.js` | created |
| `src/components/WorkerBridgeDemo/index.jsx` | created |
| `src/components/WorkerBridgeDemo/WorkerBridgeDemo.module.css` | created |
| `src/components/PollDeltaFeed/index.jsx` | created |
| `src/components/PollDeltaFeed/PollDeltaFeed.module.css` | created |
| `src/components/ReplayDemo/index.jsx` | created |
| `src/components/ReplayDemo/ReplayDemo.module.css` | created |
| `src/data/fetchTiming.js` | created |
| `src/components/LatencyHistogram/index.jsx` | created |
| `src/components/LatencyHistogram/LatencyHistogram.module.css` | created |
| `src/components/HealthPanel/index.jsx` | created |
| `src/components/HealthPanel/HealthPanel.module.css` | created |
| `src/data/relay.js` | modified — added `pollRecordings`, imports `fetchTiming` for side effect |
| `src/App.jsx` | modified — 6 new imports, 6 new sections, `HealthPanel` mounted first |
| `src/App.module.css` | modified — new section class names |

Build: clean, 90 modules. Worker bundled inline (`?worker&inline`), verified
against the standalone single-file artifact build too.

---

## What this does NOT change

- No modifications to any pre-existing component's own behavior.
- No schema or data model changes.
- `WorkerBridgeDemo` deliberately does not touch `deskStore`'s own
  `reconcile()` — it keeps an independent cloned snapshot and diffs off-thread
  purely to exercise the worker-to-signal bridge as an additive pattern.
