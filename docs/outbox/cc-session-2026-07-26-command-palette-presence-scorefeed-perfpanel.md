# CC Session Outbox — Command Palette, Presence, Score Feed, Reactive Cost Panel

**Date:** 2026-07-26
**PR:** jeffunglesbee-create/field-playground#5 (open — CI/CodeRabbit review pending as of this writing)
**Branch:** claude/playground-setup-njng55
**Head commit:** a790328

---

## What was built

Four new product surfaces, requested explicitly as "new product angles with
no current analog" — each grounded in real app state and a genuine SolidJS
mechanism, not synthetic demo data.

### 1. CommandPalette — Cmd+K modal, freeform text parsed into real app signals

**Question:** Can a command-driven interaction model coexist with a
button-driven one over the exact same state, with zero coupling between
them?

**Answer:** Yes. `Ctrl+K`/`Cmd+K` opens a modal that parses freeform text
(`go to 2026-07-20`, `go to yesterday`, `watch Rangers`, `unwatch Rangers`,
`filter MLB`, `clear filter`, `live only`, `all games`) and calls the SAME
setters DeskCard's own buttons already call: `setCurrentDate`, `setWatched`,
`setHighlightedGameId`, `collapsed`/`setCollapsed`, `setLiveOnly`. Because
these are the real signals, every effect already wired to them fires
identically — DeskCard's `initExtendedUrlSync` picks up a command-driven
`watch`/`filter`/`live` change and updates the URL exactly as it would for a
click, and `setHighlightedGameId` triggers the same scroll-into-view +
self-clearing highlight DeskCard's own GameRow effect already implements.
Global (window-scoped) keyboard listener, deliberately unlike
UndoStackDemo's subtree-scoped one — Cmd+K has no native browser binding to
protect against and is meant to be reachable from anywhere, same as real
command palettes (VS Code, Slack, Linear).

**Bug found during testing:** the input's `ref={el => el.focus()}` fired
before the element was attached to the document (Solid constructs DOM nodes
bottom-up before the top-level insertion), so `.focus()` silently no-op'd.
Fixed with `ref={el => queueMicrotask(() => el.focus())}`.

### 2. Presence — join/heartbeat/leave/timeout protocol over BroadcastChannel

**Question:** "How many tabs have this date open right now" has no server to
ask. Can a real presence protocol be built from nothing but
`BroadcastChannel`?

**Answer:** Yes, but it needs its own invented semantics — there's no
connection event and no server-side disconnect detection. `join` announces a
new tab and gets an immediate `heartbeat` reply from every existing tab
(so a late joiner doesn't wait up to 5s to discover peers already present).
Routine `heartbeat`s repeat every 5s. `leave` fires on `beforeunload` for a
clean close. A `reap` timer every 5s drops any peer whose `lastSeen` exceeds
2.5× the heartbeat interval — the only way to detect a crashed/force-quit
tab that never got to send `leave`. Verified both paths in two real browser
contexts: clean close propagates `leave` within ~1s; a hard `page.close()`
with no `beforeunload` correctly falls through to a `timeout` event via the
reap timer (~13s). Viewer count is filtered to peers whose last-known date
matches the local tab's `currentDate` (+1 for self); a date change
broadcasts an immediate heartbeat rather than waiting for the next tick.

### 3. ScoreFeed — same derived events as PollDeltaFeed, a different surface

**Question:** Can one shared signal drive two genuinely different product
treatments (a compact log vs. a card feed) without either owning or racing
over the derivation?

**Answer:** Yes — but this required a real refactor first. PollDeltaFeed's
event-derivation logic (`status`, `describeChanges`, `recordCycle`, the
module-level events signal and its seed/reseed-on-date-change guards) moved
into a new `src/data/scoreEvents.js`, called once from `App.jsx`'s
`initScoreEvents()` (same pattern as `initUrlDateSync`/
`initBroadcastDateSync`). PollDeltaFeed and ScoreFeed are now both pure
presentations of that one diff engine. ScoreFeed renders the identical
events as reverse-chronological Twitter-style cards with kind filter chips
(all/went live/score/final/appeared) and a live-ticking relative timestamp;
PollDeltaFeed is unchanged visually. Verified via direct signal injection
(`setScoreEvents(...)` through Vite's dev ESM graph) that both components
render the same 5 synthetic events identically and that filtering narrows
correctly — this environment's mock relay fixture only transitions one game
once per server lifetime, and a pre-existing duplicate-request quirk in the
dev mock (confirmed present on `main` before this branch too, not a
regression) collapses that transition into the very first request batch
before any effect can capture a "pregame" baseline, so the real poll-driven
path couldn't be exercised end-to-end in this sandbox.

### 4. ReactivePerfPanel — the reconciliation-vs-remounting cost, as a number

**Question:** Every existing proof in this repo that reconciliation beats
remounting (DeskCard's `mountCounts`, `docs/EXPERIMENT-live-reconciliation.md`)
shows DOM node identity — true or false. Can the actual cost be shown as a
number instead?

**Answer:** Yes. A collapsible `<details>` dev overlay renders two parallel
`<For>` lists fed the same real `deskStore` data every poll cycle:
"reconciled" keeps the live store proxy objects (stable identity, patched in
place — how `reconcile()` actually behaves); "remounted" re-spreads every
game into a brand-new plain object every cycle, so `<For>`'s reference-based
diffing can't recognize any of them and tears down + rebuilds every row
regardless of whether that game's data changed. Real `createEffect` calls
inside each row bump a shared counter store — not an estimate. Both list
memos explicitly depend on `deskLastFetchedAt()` rather than on
`deskStore.games`' own array identity, because `reconcile()` patches an
unchanged game's fields via a nested property write that never touches the
array's own index slots — a memo that only depended on the array would
silently stop re-running the moment a cycle didn't add/remove a game,
undermining the exact measurement the panel exists to take. The
cycle-boundary delta snapshot uses `untrack()` (new to this repo) so it
fires once per poll, not once per individual counter bump. Verified over 4
real poll cycles: reconciled total stayed at 8 (only the initial mount
batch — no score changes occurred in this run), remounted total reached 32
(8 games × 4 cycles, unconditionally).

---

## Bugs found and fixed during this session

1. CommandPalette input not receiving focus on open (ref timing) — see above.
2. Confirmed (not fixed, out of scope): a pre-existing dev-mock duplicate-request
   quirk (~16 near-simultaneous `/context/date/` requests on page load) exists
   identically on `main` before this branch — reproduced via stash/pop
   A-B testing. Not a regression; not investigated further since it's a
   local dev-fixture artifact, not present against the real relay worker.
3. Confirmed (not fixed, out of scope): the artifact build's "Failed to
   fetch" top-level ErrorBoundary catch in this sandbox is the same
   pre-existing zero-internet-access limitation documented in
   `chat-update-2026-07-25-live-probe-url.md` — reproduced identically on
   `main` before this branch.

---

## Files changed

| Path | Status |
|------|--------|
| `src/data/scoreEvents.js` | created — extracted from PollDeltaFeed |
| `src/data/presence.js` | created |
| `src/data/reactivePerf.js` | created |
| `src/components/CommandPalette/index.jsx` | created |
| `src/components/CommandPalette/CommandPalette.module.css` | created |
| `src/components/Presence/index.jsx` | created |
| `src/components/Presence/Presence.module.css` | created |
| `src/components/ScoreFeed/index.jsx` | created |
| `src/components/ScoreFeed/ScoreFeed.module.css` | created |
| `src/components/ReactivePerfPanel/index.jsx` | created |
| `src/components/ReactivePerfPanel/ReactivePerfPanel.module.css` | created |
| `src/components/PollDeltaFeed/index.jsx` | modified — now a pure presentation of `data/scoreEvents.js` |
| `src/App.jsx` | modified — 4 new imports/sections, `initScoreEvents()`/`initPresence()` added to onMount |
| `src/App.module.css` | modified — new section class names |

Build: clean on both the standard build (101 modules) and the single-file
artifact build (100 modules, zero separate chunks). Full app-wide headless
sweep: 48 sections rendered, zero console errors.

---

## What this does NOT change

- No modifications to DeskCard's actual GameRow render path — ReactivePerfPanel
  is a parallel, additive instrumentation graph over the same data, not a
  patch to production code.
- No schema or data model changes.
- PollDeltaFeed's visual output is unchanged; only its data source moved.
