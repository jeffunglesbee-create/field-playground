# CC Session Outbox — ScaleTest (Control Group at 500 synthetic rows)

**Date:** 2026-07-27
**PR:** jeffunglesbee-create/field-playground#26 (merged)
**Commit:** 3b3f522 (squash merge to main)

---

## What was asked

"What's next for playground?" -- recommended closing the gap
ControlGroup's own outbox docs flagged as unanswered: every reading so
far measured the vanilla-vs-reconcile comparison against the real
deskStore's ~8-game slate, the same toy size every other Lab demo
already uses. That answers "does `reconcile()` work," not "does it
matter at the volume FIELD actually runs at." User approved building
the scale test.

---

## What was built

- **Extracted the instrumentation** (mutation-kind classification,
  layout-shift attribution, per-cycle bookkeeping) out of
  `ControlGroup/index.jsx` into `metrics.js`, and the **shared
  presentational shell** (header/panels/metrics-table/paint-note
  markup) into `ComparisonView.jsx`, so `ScaleTest` reuses the
  *identical* measurement and display logic rather than a second copy
  that could quietly drift from what `ControlGroup` actually shows --
  the whole point of a control group is that both cases share every
  mechanism except the one thing under test.
- **`ScaleTest`** reuses `VanillaGameList`/`ReconcileGameList`
  unmodified -- same `renderAll`/`reconcile()` mechanisms under test,
  fed 500 synthetic rows instead of real deskStore data. A local
  `createStore` + `reconcile()` drives its own synthetic 4s poll
  (independent of the real app's 15s cadence on purpose), advancing
  ~5% of still-live games each cycle. Labeled as synthetic throughout.

---

## CodeRabbit findings -- 3, all real, all addressed

1. **`paintMs` reported garbage if the tab was backgrounded.**
   `requestAnimationFrame` pauses while `document.hidden`, so a cycle
   ticking in a background tab would resolve its rAF pair only on
   refocus, reporting the whole backgrounded interval (seconds) as
   paint latency. Fixed: skip the sample when the tab is hidden at
   cycle start.
2. **Duplicated MutationObserver setup.** The two observer effects in
   `createControlGroupMetrics` were byte-identical apart from which
   container/setter/knownNodes they closed over. Factored into a
   single `observePanel()` helper, making "both panels get identical
   instrumentation" a structural guarantee.
3. **Duplicated comparison view.** `ScaleTest.jsx` mirrored
   `ControlGroup/index.jsx`'s entire presentational shell. Extracted
   into `ComparisonView.jsx`; both callers spread `{...metrics}`
   directly so the metrics shape and what's displayed can't drift
   apart unnoticed.

---

## Verification

`npm run build` clean at every stage. Live, across multiple full server
restarts: `ControlGroup`'s own metrics re-verified unchanged after both
the initial extraction and the CodeRabbit fixup (dev mock's
pregame-to-live transition still classifies as 1 new + 1 removed /
1 patched). `ScaleTest` renders all 500 synthetic rows in both panels;
DOM mutations avg/cycle at this volume (~13-14/cycle observed) is
meaningfully larger than the toy comparison's 1.0/1.0 -- an actual
measurement at real scale, not an extrapolation. Confirmed the paintMs
fix doesn't affect the normal foreground case. Full 7-tab sweep: zero
dead sections, no console errors. Lab tab count 16 -> 17.

---

## Files changed

| Path | Status |
|------|--------|
| `src/components/ControlGroup/metrics.js` | new -- shared instrumentation |
| `src/components/ControlGroup/ComparisonView.jsx` | new -- shared presentational shell |
| `src/components/ControlGroup/ScaleTest.jsx` | new -- same comparison at 500 synthetic rows |
| `src/components/ControlGroup/index.jsx` | modified -- refactored to use metrics.js/ComparisonView.jsx, behavior unchanged |
| `src/App.jsx` | modified -- `ScaleTest` mounted in its own `SafeSection`, Lab tab; count 16 -> 17 |
| `src/App.module.css` | modified -- `.scaleTest` added to shared section layout class list |

---

## What this does NOT change

- `VanillaGameList.jsx`/`ReconcileGameList.jsx` are untouched.
- Does not exercise row reordering -- the real deskStore poll never
  reorders games either, so neither this nor `ControlGroup` has tested
  the "moved" classification against real conditions. Noted in code
  comments as a known, separate gap.
