# Experiment: Pick'em — derived state across two reactive sources

**Status: CONFIRMED, 2026-07-25. Real browser verification, not just a
clean build.**

**The question:** every prior component in this repo was read-only —
fetch, render, done. Pick'em introduces the first genuinely new kind of
state: a user's own pick, stored locally, that has to be compared
against `deskStore`'s live-polled game data to know if it was right.
That comparison depends on *two* independent reactive sources at once —
local user input and polled relay data. Does a pick's displayed status
("pending" → "correct"/"incorrect") update itself automatically the
moment a poll cycle brings back a final score, with zero manual
recheck/refresh logic anywhere in the code?

**Scope:** reuses `deskStore` directly rather than fetching anything of
its own. Picks stored in `localStorage`. No backend, no relay write, no
RUWT tension.

**Done when:** a pick's status genuinely flips from pending to
correct/incorrect on its own, driven purely by `deskStore`'s existing
poll cycle, confirmed live.

## Log

**2026-07-24** — Built: `src/components/PickEm/`, wired into `App.jsx`,
status badge composes `shared.chip` from the start. `npm run build`
clean, 17 modules. Runtime verification pending the same tooling gap
`live-reconciliation` had at the time.

**2026-07-25 — CONFIRMED**, using the same verification harness proven
for `live-reconciliation` (`scripts/verify-reconciliation.mjs` +
`reconciliation-check-v3.yml`, real production build, real browser,
Playwright `page.route()` for deterministic mock data across three poll
stages: pregame → live → final). Picked Houston Astros while the game
was still pregame — status read `pending`, confirmed. Two poll cycles
later, the mock resolves the game final with Astros winning — status
read `correct`, confirmed, with zero manual recheck code anywhere in the
component. Full manifest: `pickem_pick_registered_as_pending: true`,
`pickem_resolved_correct_after_final: true`.

One real methodology bug caught and fixed along the way, worth logging
honestly: the first combined run picked Houston Astros but the mock data
actually had the *home* team (Texas Rangers) winning — PickEm correctly
resolved the pick as `incorrect`, which was the right answer given that
data, not a bug. The test's own expectation was backwards, not the app.
Fixed by correcting the mock so the picked team actually wins, matching
what the test was meant to check. Worth the same discipline applied
everywhere else in this project: a failing check is not automatically
evidence of an app bug, and needs the same scrutiny either way before
concluding which side was wrong.

**Final answer:** yes — the derived-state pattern (local signal +
`createMemo` reading polled store data) resolves automatically, exactly
as designed, confirmed via real DOM reads in a real browser, not
inferred from the code.
