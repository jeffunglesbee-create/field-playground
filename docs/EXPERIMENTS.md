# Experiments — status index

One-line status per experiment. Full reasoning lives in each experiment's
own file — this is the "what's actually done" view, not the reasoning.

| Experiment | Status | Result |
|---|---|---|
| [`desk-ambient-rebuild`](EXPERIMENT-desk-ambient-rebuild.md) | **Done** | Split result — skeleton/render-state bugs: structurally prevented (`<Switch>`). CSS containment bugs: not prevented by the framework, still needs a shared primitive + verification, same as ever. |
| [`live-reconciliation`](EXPERIMENT-live-reconciliation.md) | Scoped, not started | — |
| [`chip-density-stress`](EXPERIMENT-chip-density-stress.md) | Considered, not started | Deprioritized — same bug class as `desk-ambient-rebuild` already tested, unlikely to produce new information. |
| [`fieldjs-module-migration`](EXPERIMENT-fieldjs-module-migration.md) | Considered, not started | Deprioritized — different kind of task (extraction/refactor of real production code, not a from-scratch build); real analysis, never a live edit path from this repo. |

**Adding a new one:** new file as `EXPERIMENT-{name}.md`, same shape as
the existing ones (question, scope, explicit non-goals, done condition
that accepts either outcome as valid) — then add a row here. Don't skip
the row; this table existing at all is the point.
