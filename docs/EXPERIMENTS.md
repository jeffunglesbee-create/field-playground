# Experiments — status index

One-line status per experiment. Full reasoning lives in each experiment's
own file — this is the "what's actually done" view, not the reasoning.

| Experiment | Status | Result |
|---|---|---|
| [`desk-ambient-rebuild`](EXPERIMENT-desk-ambient-rebuild.md) | **Done** | Split result — skeleton/render-state bugs: structurally prevented (`<Switch>`). CSS containment bugs: not prevented by the framework, still needs a shared primitive + verification, same as ever. |
| [`live-reconciliation`](EXPERIMENT-live-reconciliation.md) | Built, verification attempted and inconclusive | Real fix built (`createStore` + `reconcile`), builds clean. Tried to automate verification via Puppeteer (blocked — Chromium unreachable from this sandbox) and a standalone Node harness (four iterations, real negative signal on raw reference checks, but the more trustworthy effect-based check couldn't run at all in Node — harness itself unreliable, not a confirmed pass or fail). A GHA Playwright workflow (`live-reconciliation-check.yml`) was dispatched to settle it live; last checked it was still running. |
| [`pickem-derived-state`](EXPERIMENT-pickem-derived-state.md) | Built, runtime not yet verified | New kind of state (user pick + local persistence), reuses `deskStore` directly. Tests whether pick status flips pending→correct/incorrect automatically off the existing poll cycle. Same tooling gap as `live-reconciliation` — needs a real browser to confirm. |
| [`seasons-ground-mockups`](EXPERIMENT-seasons-ground-mockups.md) | Built (Seasons + Ground both) | Product-concept mockups, not architecture tests — different kind of "done." Seasons: real finding first — relay's standings data is pre-rendered prose, not structured, so it's sample-data-only (clearly labeled in the UI). Ground: pure UI mockup, sample content, no backend, honest that it's a product-judgment question not a technical one. Builds clean. |
| [`chip-density-stress`](EXPERIMENT-chip-density-stress.md) | Considered, not started | Deprioritized — same bug class as `desk-ambient-rebuild` already tested, unlikely to produce new information. |
| [`fieldjs-module-migration`](EXPERIMENT-fieldjs-module-migration.md) | Considered, not started | Deprioritized — different kind of task (extraction/refactor of real production code, not a from-scratch build); real analysis, never a live edit path from this repo. |

**Adding a new one:** new file as `EXPERIMENT-{name}.md`, same shape as
the existing ones (question, scope, explicit non-goals, done condition
that accepts either outcome as valid) — then add a row here. Don't skip
the row; this table existing at all is the point.
