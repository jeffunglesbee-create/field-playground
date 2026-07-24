# Experiment: Pick'em — derived state across two reactive sources

**Status: built, verified to build clean. Runtime behavior not yet
watched live — same tooling gap as `live-reconciliation`.**

**The question:** every prior component in this repo was read-only —
fetch, render, done. Pick'em introduces the first genuinely new kind of
state: a user's own pick, stored locally, that has to be compared
against `deskStore`'s live-polled game data to know if it was right.
That comparison depends on *two* independent reactive sources at once —
local user input and polled relay data. Does a pick's displayed status
("pending" → "correct"/"incorrect") update itself automatically the
moment a poll cycle brings back a final score, with zero manual
recheck/refresh logic anywhere in the code? That's the real test, not
"does a Pick'em UI exist."

**Scope:** reuses `deskStore` directly rather than fetching anything of
its own — same games DeskCard already shows. Picks stored in
`localStorage` (a real standalone Vite app, not a Claude.ai sandboxed
artifact — browser storage is fine here, unlike in-chat artifacts where
it's unavailable). No backend, no relay write, no new endpoint. A user's
own predictions aren't FIELD's proprietary drama scoring — no RUWT
tension, same as everything else here.

**Explicitly not doing:** no accounts, no cross-device sync, no
leaderboard, no real scoring algorithm beyond "did you pick the winner."
Structural question first — polish only if the structural answer is
worth building on.

**Done when:** a pick's status genuinely flips from pending to
correct/incorrect on its own, driven purely by `deskStore`'s existing
poll cycle, confirmed live — not by re-reading the code and assuming the
`createMemo` will do the right thing.

## Log

**2026-07-24** — Built: `src/components/PickEm/` (component + styles),
wired into `App.jsx` as a third section, status badge composes
`shared.chip` for containment (principle #6, applied from the start this
time instead of found missing after the fact). `npm run build` clean, 17
modules. Runtime verification — does the derived status actually flip
live — needs the same real-browser access `live-reconciliation` is still
waiting on. Not a new gap, the same one, one more thing stacked behind
it.
