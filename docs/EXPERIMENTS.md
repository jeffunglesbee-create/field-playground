# Experiments — status index

One-line status per experiment. Full reasoning lives in each experiment's
own file, or in `docs/outbox/` for the batch entries — this is the
"what's actually done" view, not the reasoning.

| Experiment | Status | Result |
|---|---|---|
| [`desk-ambient-rebuild`](EXPERIMENT-desk-ambient-rebuild.md) | **Done** | Split result — skeleton/render-state bugs: structurally prevented (`<Switch>`). CSS containment bugs: not prevented by the framework, still needs a shared primitive + verification. |
| [`live-reconciliation`](EXPERIMENT-live-reconciliation.md) | **Done** | Confirmed via real DOM node-reference identity — `deskStore` + `reconcile()` genuinely prevents unnecessary remounts. Took finding a real bug in `DeskCard`'s own `<Switch>` (checking `.loading`, true on every refetch) before the answer was visible. |
| [`pickem-derived-state`](EXPERIMENT-pickem-derived-state.md) | **Done** | Real-browser confirmed — a pick shows `pending`, then auto-resolves to `correct`/`incorrect` once the game goes final. |
| [`production-gaps-2026-07-25`](EXPERIMENT-production-gaps-2026-07-25.md) | **Done (5/5 live-confirmed)** | Watchlist, transition toast (`<Portal>`), date browser, URL-persisted date, BroadcastChannel sync. Real finding: `createSignal(new Set())` silently fails to notify on `.add()`/`.delete()`; `createStore` doesn't have that trap. |
| `solidjs-mechanisms` ([outbox](outbox/chat-update-2026-07-25-solidjs-mechanisms.md)) | **Done** | Six primitives: `createRoot` disposal, `untrack`, drag-reorder via `produce()`, `batch`, `lazy`+`Suspense`, three-source derived state (`Agreement`/`CrossCheck`). |
| `solid-primitives-batch-2` ([outbox](outbox/cc-session-2026-07-25-solid-primitives-batch-2.md)) | **Done** | Seven: `createContext`, `createSelector` (O(1) proven with live per-row eval counters), `lazy`+`ErrorBoundary` composition, `mergeProps`/`splitProps`, `startTransition` on the *shared* signal, `createComputed` (fires pre-render, timestamped), `indexArray` vs `mapArray`. |
| `playground-novel-patterns` ([outbox](outbox/cc-session-2026-07-25-playground-novel-patterns.md)) | **Done** | `ErrorBoundaryDemo` (sync throws vs `resource.error` are fully separate paths — neither catches the other), `DrillDown` (resource sourced from another resource, `undefined` as "don't fetch yet"), `TransitionDemo`. |
| `personal-product-surfaces` ([outbox](outbox/cc-session-2026-07-25-personal-product-surfaces.md)) | **Done** | `PickStreak`, `Calibration` (Brier score), `CompareToRelay`, `LocalNoteLayer`, `MultiDateTrend`. Found and fixed the `PropsDemo` crash that blanked the whole app, and the real root cause of the Seasons disappearance. |
| `orthogonal-mechanisms` ([outbox](outbox/cc-session-2026-07-25-solid-primitives-batch-2.md)) | **Done** | `UndoStackDemo`, `WorkerBridgeDemo`, `PollDeltaFeed`, `ReplayDemo`, `LatencyHistogram`. Both flagged risk overlaps verified clean — delta feed observes pre-reconcile rather than intercepting; the global fetch wrapper preserves Response pass-through and rethrow, so `.error` guards still hold. |
| [`seasons-ground-mockups`](EXPERIMENT-seasons-ground-mockups.md) | Built | Product-concept mockups, not architecture tests. Seasons: MLB + MLS real and live; World Cup real but concluded; NFL/EPL sample. Ground: pure UI mockup. |
| [`chip-density-stress`](EXPERIMENT-chip-density-stress.md) | Considered, not started | Same bug class as `desk-ambient-rebuild`. |
| [`fieldjs-module-migration`](EXPERIMENT-fieldjs-module-migration.md) | Considered, not started | Different kind of task; never a live edit path from here. |

**Adding a new one:** new file as `EXPERIMENT-{name}.md`, same shape as
the existing ones (question, scope, explicit non-goals, done condition
that accepts either outcome as valid) — then add a row here. Don't skip
the row; this table existing at all is the point. Batch work that lives
in `docs/outbox/` still gets a row, linked to the outbox entry — this
index went stale on 2026-07-25 precisely because four batches (20+
components) shipped without one.

## Graduation status — per `OPERATING-MODE.md`'s checkpoint rule

**Nothing has graduated to `jubilant-bassoon` or `field-relay-nba`.**
Stated explicitly rather than left silent, which is the failure mode
that rule exists to prevent. Confirmed, un-graduated findings:

- `<Switch>`-based render-state exclusivity
- shared chip/pill primitive
- `createStore` + `reconcile()` for live polling
- **`.error`-before-accessor guards on every resource consumer** — added
  today, the highest-value candidate: production FIELD has the same
  silent-subtree-removal exposure, and this is what caused the blank
  artifacts here
- top-level `<ErrorBoundary>` around the app tree

Whether any of these gets a real CC-CMD is Jeff's call. The rule only
requires the call be made and written down, not that it happen
automatically.

## Verification harnesses

- `scripts/verify-reconciliation.mjs` + `.github/workflows/reconciliation-check-v3.yml`
  — real build, static serve, Playwright `page.route()` across three poll
  stages (pregame/live/final). Eleven checks across five experiments.
- `scripts/verify-artifact.mjs` + `.github/workflows/artifact-check.yml`
  — **the deliverable check.** Builds the artifact exactly as shipped,
  loads it at an opaque origin (matching the Claude.ai sandbox, so relay
  fetches fail the same way), asserts `#root` actually has children and
  that page/console errors are zero. Added after three blank artifacts
  shipped on the strength of clean builds alone.
- `scripts/verify-outcomes-sync.mjs`, `verify-url-load.mjs`,
  `verify-broadcast-isolated.mjs` — narrower, isolated checks.

Extend an existing harness before reaching for a new one.
