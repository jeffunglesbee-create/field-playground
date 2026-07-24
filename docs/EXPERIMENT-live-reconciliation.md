# Experiment: live reconciliation (poll → partial update)

**The question, made sharp enough to actually answer:** the first
experiment (AmbientPanel/DeskCard) only tested *initial load* — skeleton
to content, once. It never tested what happens on *re-fetch*, which is
where FIELD's actual worst bugs have lived: cards stuck on live state
after a game goes final, a pick-resolution flag that never flips,
cross-game text racing on re-render. Those are reconciliation bugs, not
render bugs — a different failure class, untested by the first
experiment entirely. Would a real reactive framework make *that* class
structurally harder to write, the same way it did for skeleton-overlap?
Genuinely unknown — this experiment tests it.

**Scope, on purpose:** extend the existing `DeskCard` component (not a
new one) to poll `/context/date/{date}` on an interval and reconcile
incoming state against what's already rendered — a live game's score
updating, a game transitioning pre→live→final→final_ot, without a full
remount. Read-only, off the same commodity relay endpoint already in
use. Zero new RUWT tension — nothing computes or ships, same as before.

**Explicitly not doing:** journalism, drama state, picks, anything that
writes. Still just watching public game data change over time.

**Why this specific bug class, not a broader stress test:** a
same-lane-but-more-instances test (e.g. more chip types) would mostly
re-confirm what's already known about principle #6. This targets
something genuinely untested — temporal state, not just initial state —
which is where the real, already-documented FIELD incidents actually
happened, per Codex and prior HANDOFF entries (MLB cards stuck live
after final, a permanently-stuck pick-resolution flag, a Night Owl
cross-game text race). Real incidents, not hypothetical ones — same
standard the first experiment held itself to.

**Done when:** a live poll cycle correctly transitions a game's rendered
state without a full remount or a stuck intermediate state, AND there's
an honest answer to whether that came free from `createResource`'s
signal-driven refetch or required the same kind of manual bookkeeping
field.js needed. Either answer is a real result.

---

## Log

**2026-07-24** — Checked the mechanism before building, not after: does a
plain `createResource` refetch give free fine-grained updates on poll?
No — confirmed via SolidJS's own docs and core-team discussion
(github.com/solidjs/solid/discussions/366), not guessed. `<For>` keys by
reference by default; `fetch().json()` returns a brand-new array of
brand-new objects every call; updating one field on one row this way
"will re-render that whole row... recreating all the DOM nodes," per a
SolidJS maintainer directly describing this exact case. So the honest
first-pass answer was already known before writing a naive version: it
would NOT have been free, same as chip-overflow wasn't free in the first
experiment.

Given that, built the real fix directly rather than a naive version
first and a fix later — the correct pattern is documented precisely for
this exact scenario (poll a server, merge into fine-grained state):
`createStore` + `reconcile()`, matching the idiom in SolidJS's own
stores documentation almost exactly.

**What's actually built:**
- `src/data/relay.js` — `deskStore` (a real `createStore`), reconciled
  via `reconcile(json)` inside the fetcher on every poll. `deskData`
  (the resource) now just signals loading/error/success state; the
  fine-grained data lives in the store.
- `src/App.jsx` — polls `refetchDesk()` every 15s via `onMount`/
  `onCleanup`, matching this project's already-established "good
  citizen" cadence for this relay.
- `src/components/DeskCard/index.jsx` — reads from `deskStore` instead
  of the resource's return value. Real instrumentation added: a per-game
  mount counter (`mountCounts`), visible as a small dev-only badge on
  each row (`m1`, `m2`, ...) and logged to console in dev mode.

**Verified:** `npm install && npm run build` — clean, 15 modules, no
errors.

---

**2026-07-24, automated verification attempt.** Tried to close the
runtime-behavior gap directly rather than leave it for someone else.
Two approaches, both genuinely attempted, neither gave a clean answer —
reporting exactly what happened rather than picking whichever result is
more convenient.

**Attempt 1 — real headless browser (Puppeteer).** `npm install
puppeteer` fails in this environment: Chromium download gets a 403 from
`storage.googleapis.com`, which isn't reachable from here. Confirmed by
actually running it, not assumed from the existing "no deployed URL"
note. This closes off the most direct verification path from chat's own
sandbox specifically — not a general statement about whether it's
possible anywhere, just that it isn't from here.

**Attempt 2 — standalone Node script against the real `solid-js/store`
package, no browser at all.** Four iterations, each addressing a problem
found in the last:
1. First pass: reconciled two slightly-different "polls" into a real
   store, compared object references directly. Result: references
   changed across every reconcile call, for both the changed AND an
   untouched, byte-identical game. Surprising — contradicts the sourced
   claim above.
2. Second pass: suspected the store's proxy wrapper re-wraps on every
   external access rather than the underlying data actually changing —
   used `unwrap()` to compare raw targets instead. Same result: `false`
   across the board, even for the untouched game.
3. Third pass: suspected nesting depth (`games.regular`, two levels
   deep) was breaking `reconcile`'s "match by id" default — reconciled a
   bare top-level array directly, the simplest possible case the docs
   describe. Same result again.
4. Fourth pass: reconsidered whether raw reference/unwrap comparison
   from *outside* the reactive graph is even the right thing to
   check — switched to `createEffect`, the actual mechanism `<For>`
   depends on internally, to see whether an effect scoped to an
   untouched game re-runs when a different game changes. Result:
   effects never fired at all, not even once for the initial value —
   likely because `solid-js`'s `"node"` export condition resolves to its
   SSR build, which doesn't drive the same effect-flushing scheduler a
   real browser render does. Added an explicit tick delay between
   reconciles to rule out a timing issue — same result, still zero runs.

**Honest conclusion: inconclusive, not failed.** The reference/unwrap
tests (1–3) showed a real, reproducible negative signal across three
different configurations, including the simplest one the documentation
itself describes — that's not nothing, and it's worth taking seriously.
But the effect-based test (4), which should be the *more* trustworthy
check since it uses the same tracking mechanism `<For>` actually relies
on, couldn't run at all in this environment — meaning the test harness
itself has a real, unresolved compatibility gap between solid-js's
Node/SSR build and how the library behaves when actually driven by a
browser's render cycle. A negative result from a harness that can't even
run its own control case isn't trustworthy enough to overwrite the
sourced claim from earlier in this log, but it's also not something to
wave away — it's a genuine, specific reason to distrust "verify via
plain Node" as a substitute for "verify via an actual browser," which
narrows what the next real verification step needs to be.

**What this changes about the next step:** not "watch it run" in
general — specifically, *only a real browser render* will settle this.
Neither a Node script (tried, inconclusive for the reasons above) nor
this chat's own sandbox (Puppeteer's binary is unreachable from here)
can close it. Claude Code's own environment or `npm run dev` opened
locally remain the real path — same as before, just now with two ruled-
out shortcuts and a clearer reason why they didn't substitute for it.

Scripts from this attempt (`verify-reconcile*.mjs`) were scratch work in
chat's own sandbox, not committed — the finding is what's worth keeping,
not the throwaway harness that produced an inconclusive result.
