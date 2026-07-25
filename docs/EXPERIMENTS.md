# Experiments — status index

One-line status per experiment. Full reasoning lives in each experiment's
own file — this is the "what's actually done" view, not the reasoning.

| Experiment | Status | Result |
|---|---|---|
| [`desk-ambient-rebuild`](EXPERIMENT-desk-ambient-rebuild.md) | **Done** | Split result — skeleton/render-state bugs: structurally prevented (`<Switch>`). CSS containment bugs: not prevented by the framework, still needs a shared primitive + verification, same as ever. |
| [`live-reconciliation`](EXPERIMENT-live-reconciliation.md) | **Done** | Confirmed via real DOM node-reference identity (both the changed and unchanged game kept the exact same node across a poll cycle) — `deskStore` + `reconcile()` genuinely prevents unnecessary remounts. Took finding and fixing a real bug in `DeskCard`'s own `<Switch>` before the answer was visible. Full resolution chain in the experiment doc. |
| [`pickem-derived-state`](EXPERIMENT-pickem-derived-state.md) | **Done** | Confirmed via the same real-browser harness — a pick correctly shows `pending`, then automatically resolves to `correct`/`incorrect` once the game goes final. |
| [`production-gaps-2026-07-25`](EXPERIMENT-production-gaps-2026-07-25.md) | **Done (5/5 live-confirmed)** | Watchlist, game-transition toast (`<Portal>`, first use in this repo), and date browser all confirmed via real browser checks. Date browser needed two real test-bug fixes first (a too-short wait, then an ambiguous cross-component selector reading AmbientPanel's date instead of DeskCard's) — neither was an app bug. Real finding: a plain `createSignal(new Set())` would silently fail to trigger updates on `.add()`/`.delete()` — `createStore` doesn't have that trap, documented directly in the watchlist code. |
| [`seasons-ground-mockups`](EXPERIMENT-seasons-ground-mockups.md) | Built (Seasons + Ground both) | Product-concept mockups, not architecture tests — different kind of "done." Seasons: MLB + MLS real and live (tabs for divisions/wildcard, conferences), World Cup real but concluded, NFL/EPL sample. Ground: pure UI mockup, sample content, no backend. |
| [`chip-density-stress`](EXPERIMENT-chip-density-stress.md) | Considered, not started | Deprioritized — same bug class as `desk-ambient-rebuild` already tested, unlikely to produce new information. |
| [`fieldjs-module-migration`](EXPERIMENT-fieldjs-module-migration.md) | Considered, not started | Deprioritized — different kind of task (extraction/refactor of real production code, not a from-scratch build); real analysis, never a live edit path from this repo. |

**Adding a new one:** new file as `EXPERIMENT-{name}.md`, same shape as
the existing ones (question, scope, explicit non-goals, done condition
that accepts either outcome as valid) — then add a row here. Don't skip
the row; this table existing at all is the point.

**Reusable verification harness:** `scripts/verify-reconciliation.mjs` +
`.github/workflows/reconciliation-check-v3.yml` — real production build,
served statically, Playwright `page.route()` for deterministic mock
data across three poll stages (pregame/live/final), results committed
back to the repo. Now covers eleven checks across five experiments in
one run. Extend this harness before reaching for a new one.
