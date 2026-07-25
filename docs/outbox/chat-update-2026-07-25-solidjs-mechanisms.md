# chat-update-2026-07-25-solidjs-mechanisms

**From:** chat (claude.ai)
**To:** Claude Code, next session in this repo
**Status:** informational
**Repo:** field-playground (main)
**HEAD:** e59c1e9
**Covers:** session following cc-session-2026-07-24-pick-outcomes.md and chat-update-2026-07-25-for-claude-code.md

---

## What got built

Eight proposed items were evaluated; two were redundant and skipped (see below). Six genuinely novel things shipped:

### Agreement (`src/components/Agreement/`)

First time this repo joins three independent reactive sources into one derived memo: `outcomes` (editorial W/L/P from AmbientPanel), `picks` (PickEm home/away store), and `deskStore` (live game results). The join key (`game_id`) already exists on every editorial pick — nothing invented to make it work.

The derivation computes whether the user's editorial verdict (W = good pick) agrees with PickEm's own correctness verdict (correct/incorrect) for finalized games where both exist. Agreement is NOT asserted by mapping editorial W → "home team won" — that semantic mapping isn't confirmed and would be invented. Push (P) outcome renders as a separate `null` agree case. Zero glue code beyond the memo itself.

### CrossCheck (`src/components/CrossCheck/`)

Same three sources as Agreement, but displays them side-by-side rather than computing agreement. Rationale: editorial W/L/P and PickEm home/away are different axes — showing them as three live columns answers the mechanism question (does a memo reading three sources update when any one changes?) without asserting a semantic equivalence that doesn't exist.

### `createRoot` disposal demo (`src/components/CreateRootDemo/`)

Explicit test of `createRoot`'s disposal lifecycle — the first in this repo. Toast was redesigned so each toast gets its own detached reactive root (not the component tree root). `rootStats.created` and `rootStats.disposed` are tracked directly in a signal so a leak is observable as a number, not inferred from absence. Auto-dismiss calls `dispose()` explicitly. Both manual dismiss and auto-dismiss paths were instrumented.

### `untrack` — real use case, not a contrived demo

The DeskCard game-transition toast now includes a pick-count snapshot captured via `untrack(() => outcomes())` at the moment it fires. The snapshot doesn't retroactively update if more outcomes are set later — the toast is a moment in time, not a live-updating value. This is the natural use case for `untrack`: reading a signal for a side effect without subscribing to its future changes.

### Drag-to-reorder picks (`src/components/AmbientPanel/`)

AmbientPanel picks are now drag-reorderable using `produce()` for path-based store mutation rather than full-array replacement. A `pickOrder` store holds the user's local ordering; it syncs from server order only when the underlying pick set changes (different game_ids), not on every poll. Tests whether `<For>` maintains component identity across a reorder — the mechanism answer is in whether mount counts increment.

### `batch()` in date navigation (`src/components/DeskCard/`)

`shiftDay` now wraps `setCurrentDate` and `clearAllOutcomes` in a `batch()` call. Without it, two reactive passes fire: one for the date change, one for the outcomes clear. Batching collapses them into one. Also added `clearAllOutcomes` to `outcomes.js` — date navigation should reset the day's pick outcomes, and this was the natural moment to wire it.

### `lazy()` + `<Suspense>` for Seasons (`src/App.jsx`)

Seasons is now lazy-loaded via SolidJS's `lazy()`, wrapped in `<Suspense>`. Confirmation comes from the Vite build output: two separate JS bundles (9.15 KB + 65.49 KB) where there was previously one. Vite genuinely split Seasons into its own chunk.

Packaging note carried forward: the standard artifact (single inlined HTML) can't demo dynamic `import()` because it has no real file paths for the lazy chunk to resolve to. The split-bundle build output is the real confirmation; the deployed app (real files, real paths) doesn't have this limitation.

---

## Items evaluated and skipped (redundant)

- **Hash-based URL sync** — tests the same risk profile as BroadcastChannel (external event source writing to a signal, possible echo loop), already confirmed safe last session. Having both `?d=` and `#hash` drive the same date signal would be two competing URL mechanisms for one value, not a new mechanism.
- **Two-date parallel view** — `DayComparison` was already built and wired last session. Confirmed by reading the repo before building rather than assuming.

---

## Handoff loop observation

Chat noticed mid-session that `shiftDay` no longer had the redundant `refetchDesk()` call that was flagged as a carry-forward in the previous outbox — Claude Code had already fixed it. First time the loop has been confirmed working in both directions (not just chat reading Claude Code's work).

---

## Carry-forwards

- `Agreement` only shows rows for finalized games where BOTH an editorial outcome and a PickEm pick exist. In practice this means it's empty until games go final and the user has set both kinds of picks. An "in-progress" view showing non-final games side-by-side (without an agreement verdict) would make it useful earlier in the day — currently CrossCheck fills this role.
- `lazy()` artifact demo limitation noted above — not a code gap, just a constraint of the single-file artifact format.
- Nothing from either session today has graduated to `jubilant-bassoon` yet. Per the graduation rule, this is a real open call.
