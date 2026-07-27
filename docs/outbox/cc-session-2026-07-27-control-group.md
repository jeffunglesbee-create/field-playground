# CC Session Outbox — ControlGroup (Lab tab control group)

**Date:** 2026-07-27
**PR:** jeffunglesbee-create/field-playground#22 (merged)
**Commit:** 64f8550 (squash merge to main)

---

## What was asked

"Build the control group" -- following chat's own review of the Lab tab
(screenshots): ~22 demos all pass, which proves "SolidJS can do this,"
never seriously in doubt. What Lab never measured is whether
`reconcile()` is actually *better* than direct DOM manipulation for the
one real surface FIELD's worst bugs lived in -- the polled game list.
Every demo runs on the same ~46-game slate `field.js` already handles
today; nothing measured DOM cost, paint cost, or lines of code against
the incumbent.

The explicit spec: build that surface twice -- once with direct DOM
manipulation the way `field.js` does it, once with `deskStore` +
`reconcile()` -- same data, same 15s poll, same page, and measure DOM
mutations per cycle, time-to-paint, and lines of code.

---

## What was built

`ControlGroup`, mounted at the top of the Lab tab, ahead of the 22 demos
it's meant to contextualize.

- `vanillaRenderer.js` -- direct DOM manipulation modeled on production's
  actual architecture, confirmed via `CODE_MAP.json`'s function index
  (not guessed from names): `renderCard`/`updateCard`/
  `renderAll(skipUnchanged)` gated by a computed per-game render
  signature. Create-if-missing, skip-if-signature-unchanged,
  patch-only-the-changed-field, remove-if-gone, reorder-if-moved.
- `ReconcileGameList.jsx` -- reads the same already-reconciled
  `deskStore` this app already polls every 15s (`relay.js`'s
  `fetchDeskReconciled` -> `setDeskStore(reconcile(json))`). `<For>`
  keys on item identity; no signature bookkeeping needed.
- `VanillaGameList.jsx` -- thin wrapper handing off to the imperative
  renderer on every real data change.
- `index.jsx` -- orchestrates both panels against the same `deskStore`
  data, no separate fetch.

Three metrics, each honestly scoped to what's actually comparable:

- **DOM mutations/cycle** -- a real `MutationObserver` per panel.
  Cleanly separable, genuinely comparable.
- **Lines of code** -- 111 (`vanillaRenderer.js`) vs 39
  (`ReconcileGameList.jsx`), counted via `wc -l`, not estimated.
- **Time-to-paint** -- deliberately *not* split per side: both panels
  update inside the same synchronous reactive flush (the same
  `setDeskStore(reconcile(json))` call drives both), so there's no real
  per-side paint moment to separate. Shown as one combined "data-change
  -> painted frame" number via a double-`requestAnimationFrame`
  measurement, explicitly labeled as combined rather than fabricating a
  false split.

---

## A real bug found and fixed along the way (before CodeRabbit ever saw it)

Cycle detection originally tracked the reconciled game-list's own
reference identity (`allGames()`, a memo spreading
`deskStore.games.regular`/`postseason`). Verified directly against the
dev mock's built-in pregame-to-live transition (the `hou-tex` game going
from pregame to live on the second poll) that this was unreliable: a
real, `MutationObserver`-confirmed DOM change sometimes didn't register
as a "cycle," with no code difference between runs. Switched to tracking
`relay.js`'s `deskLastFetchedAt` instead, which `fetchDeskReconciled`
stamps unconditionally on every successful poll -- it can't miss a cycle
the way tracking the memo's identity did.

---

## CodeRabbit findings -- 3 total, all real, all addressed

1. **Reset last-cycle counters before each poll.** A poll with zero
   mutations never fires the `MutationObserver` callback, so without a
   reset the "last cycle" reading kept showing whatever the previous
   *changed* poll left behind. Reset both last-batch signals to 0 at the
   top of every real cycle.
2. **Keep reconciliation bookkeeping out of observed DOM attributes.**
   Writing `data-sig` as an element attribute counted as an extra DOM
   mutation on every changed vanilla row, while the reconcile() panel
   has no equivalent write -- silently biasing the exact comparison this
   component exists to make. Moved signature tracking to a `WeakMap`
   keyed by element. Verified: the mutation count for a real score
   change dropped from 2 to 1 for the vanilla panel, now matching
   reconcile's 1 exactly.
3. **Reconcile row order, not just membership.** `<For>` moves keyed
   Solid nodes when array order changes; `renderAll` only ever appended
   new rows and never repositioned existing ones, which would silently
   diverge from the reconciled panel's order the first time the relay
   returns games in a different sequence. Added a `prevEl` cursor that
   repositions a row only when it isn't already in the right spot, so an
   unchanged order still costs zero DOM work.

---

## Verification

`npm run build` clean at every stage. Playwright against a live dev
server, across multiple full server restarts for determinism: both
panels render identical real game data from the same `deskStore`; the
mock's built-in pregame-to-live transition produces real, correctly
counted DOM mutations (1 vanilla, 1 reconcile, after the bias fix) and a
real combined paint-time reading (~26ms); full 7-tab sweep shows zero
dead sections and no console errors beyond the pre-existing
`HealthPanel` self-test throw (unrelated, present on `main` before this
PR). Lab tab's count badge updated 15 -> 16.

---

## Files changed

| Path | Status |
|------|--------|
| `src/components/ControlGroup/index.jsx` | new |
| `src/components/ControlGroup/vanillaRenderer.js` | new |
| `src/components/ControlGroup/VanillaGameList.jsx` | new |
| `src/components/ControlGroup/ReconcileGameList.jsx` | new |
| `src/components/ControlGroup/ControlGroup.module.css` | new |
| `src/App.jsx` | modified -- `ControlGroup` mounted in its own `SafeSection`, Lab tab, ahead of the existing demos; Lab tab count 15 -> 16 |
| `src/App.module.css` | modified -- `.controlGroup` added to shared section layout class list |

---

## What this does NOT change

- No new fetch, no new poll interval -- reuses the app's existing
  `deskStore`/15s poll exactly as-is.
- The 22 existing Lab demos are untouched.
- Does not (yet) answer the follow-on question the spec implies once
  real numbers accumulate over a longer session: which side actually
  wins on mutations/cycle at real production data volumes (500+ rows),
  since the dev mock's slate is the same ~8-game size every other
  demo already uses. The instrumentation is in place to observe that;
  this PR doesn't draw the conclusion, only makes it measurable.
