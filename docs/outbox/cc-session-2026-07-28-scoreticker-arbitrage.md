# CC Session Outbox — ScoreTicker + Arbitrage

**Date:** 2026-07-28
**Session:** mobile client, pushed directly to `main`
**Commits:** f438674, ec0e99e (ScoreTicker) → 5a0175c, bb132da (Arbitrage) →
def3e3b, 23c3ed7 (wired into Games tab) → 93d2eb5 (artifact-check
verification)

This doc is written from a different session (verifying, not building)
after the fact -- the building session pushed straight to `main` with
`[skip ci]` commits and left raw verification artifacts under
`outbox/`, but no narrative writeup, so this fills that gap per the
repo's established convention.

---

## What was built

Two new surfaces, both wired into the Games tab (deliberately not the
top-level spine -- `App.jsx`'s commit message calls that a considered
choice: "that trio is deliberately reasoned and adding a fourth
unilaterally would undo it").

**ScoreTicker** (`src/components/ScoreTicker/`) -- the first genuinely
high-frequency surface in this playground; everything before it ran on
the 15s poll. Tests a real question: does a CSS-driven marquee restart
its scroll when the underlying data re-renders? The animated track div
is deliberately *not* keyed to data; only leaf `TickerItem` score nodes
patch via `reconcile()`. An `onAnimationStart` handler increments a
`restarts` counter -- it should stay at 1 forever if `reconcile()` is
doing its job, and climb if a score change is restarting the scroll. A
1s wall clock (faster than the 15s poll) drives the "data Ns old"
readout so any interference is observable, not theoretical. Directly
cites the `ControlGroup` 2:1 node-operation finding from earlier PRs
(#22/#25/#26) as the motivating context for why this was worth testing
at a continuous cadence rather than the slow one everything else uses.

**Arbitrage** (`src/components/Arbitrage/`) -- the first surface to
touch what the session's commit calls "FIELD's actual product thesis":
what's worth watching, what it costs, why. Built on two pieces of real
data, verified before building rather than assumed:
- `game.streams` -- a real, populated relay field (comma-separated
  string, e.g. `"ESPN Unlmtd, MLB.TV, Royals.TV, Tigers.TV"`), parsed
  with `parseStreams()` and a regex `SERVICE_MAP` onto canonical
  service keys.
- `PRICES` -- production's real price table (jubilant-bassoon's
  `src/legacy/field.js`), copied verbatim, 17 services with real
  monthly costs. Anything not in the table (team RSN feeds like
  `Royals.TV`, `Tigers.TV`) renders as an explicit "unknown" chip
  rather than an invented cost -- called out directly in the code's own
  header comment as the thing this whole session has been about
  avoiding.

The actual derived value: for each unowned service, how many
currently-unreachable games it unlocks and at what cost per game,
sorted cheapest-first, with zero-unlock services excluded rather than
shown at infinite cost.

---

## Verification -- independently re-checked, not just trusted

A separate session (this one) read the actual committed code and
cross-checked every concrete claim in the building session's own
recap against it, rather than accepting the prose:

| Claim | Verified against |
|---|---|
| `streams` real, comma-separated, e.g. `"...Royals.TV, Tigers.TV"` | Literal string in `Arbitrage/index.jsx`'s header comment + `parseStreams()`'s `.split(',')` |
| `PRICES` verbatim, 17 services | Counted the object literal -- exactly 17 keys |
| Royals.TV / team RSN feeds show as unknown, not guessed | `SERVICE_MAP` has no matching regex; UI renders a `?` chip + explicit disclosure copy |
| ScoreTicker's `animationstart` restart counter, unkeyed container | `onAnimationStart={() => setRestarts(n => n + 1)}` on the outer track div; only `TickerItem` leaves change |
| `allPass: true`, `0 dead sections`, `0 errors` | Read directly from the committed `outbox/artifact-check-manifest-2026-07-28T15-09-36-518Z.json` |
| "143 modules" | Reran `npm run build` on `main` myself: `✓ 143 modules transformed.` (was 139 before these two components; +2 `.jsx` + 2 CSS modules = +4) |

Not independently confirmed (tool limits, not contradictions): the
exact dollar figures in jubilant-bassoon's real `PRICES` table --
`src/legacy/field.js` is 2.3MB and the read tool returned empty content
for it; a substring search did register a hit on `"24.99"` there
(consistent with `mlbtv: 24.99`), but that's corroborating, not
conclusive.

---

## Files changed (this session's contribution)

| Path | Status |
|------|--------|
| `docs/outbox/cc-session-2026-07-28-scoreticker-arbitrage.md` | new -- this writeup |

## Files changed (by the building session, already on `main`)

| Path | Status |
|------|--------|
| `src/components/ScoreTicker/index.jsx` | new |
| `src/components/ScoreTicker/ScoreTicker.module.css` | new |
| `src/components/Arbitrage/index.jsx` | new |
| `src/components/Arbitrage/Arbitrage.module.css` | new |
| `src/App.jsx` | modified -- wired both into the Games tab |
| `src/App.module.css` | modified -- shared section layout rule extended |
| `outbox/artifact-check-manifest-2026-07-28T15-09-36-518Z.json` | new -- raw verification manifest (allPass: true) |
| `outbox/artifact-render-2026-07-28T15-09-36-518Z.png` | new -- verification screenshot |
| `outbox/artifact-under-test-2026-07-28T15-09-36-518Z.html` | new -- artifact build under test |
