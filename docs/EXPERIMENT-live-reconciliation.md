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
  each row (`m1`, `m2`, ...) and logged to console in dev mode. This is
  the actual falsifiable check — if reconciliation is working, every
  count stays at `m1` forever, no matter how many poll cycles run or how
  many times a score changes.

**Verified:** `npm install && npm run build` — clean, 15 modules, no
errors.

**Honest gap, not glossed over:** what's NOT verified is watching this
run live across real poll cycles. This repo has no deployed URL my own
browser tooling can reach (no Cloudflare Pages/GitHub Pages configured),
and my remote browser tool can't be pointed at a local dev server —
those are real, current tooling limits, not skipped effort. The
technical claim above is sourced from SolidJS's own documentation and
core-team discussion of this exact scenario, not from watching this
specific build run. The mount-count instrumentation exists specifically
so the next session with real browser access to a running dev server —
Claude Code's own environment, or `npm run dev` open locally — can
confirm it in under a minute: watch the `m` badges across two or three
15-second poll cycles. If they climb past `m1`, the sourced claim above
was wrong and this needs a real second look, not a shrug.
