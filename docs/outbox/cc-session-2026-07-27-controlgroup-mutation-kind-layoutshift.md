# CC Session Outbox — ControlGroup mutation-kind classification + layout-shift

**Date:** 2026-07-27
**PR:** jeffunglesbee-create/field-playground#25 (merged)
**Commit:** feaaf0f (squash merge to main)

---

## What was asked

Follow-up requested from chat's independent review of PR #22. Two
separate lines of reasoning converged on the same conclusion: mutation
*count* can't distinguish a cheap in-place patch from an expensive
insertion/removal, and count alone couldn't explain a real, previously
reported result -- a human tester found the reconcile panel visibly
smoother despite tied mutation counts between the two panels.

---

## What was built

- **`classifyMutations()`** derives created/moved/patched/removed
  purely from observed `MutationObserver` records (tracking which node
  references have been seen before), not from either renderer's own
  bookkeeping -- applies fairly to both panels even though `<For>`'s
  internals are opaque from here.
- **Real layout-shift measurement**: a shared `PerformanceObserver` on
  `'layout-shift'` entries, attributed per-panel via each entry's real
  `sources` (`LayoutShiftAttribution` exposes the actual shifted node,
  so this is real per-panel measurement, not a guess). Degrades to an
  explicit "n/a" where the Layout Instability API isn't supported,
  rather than reporting a fake zero.

---

## A real, unexpected result surfaced immediately

For the identical score update, the vanilla panel classified as "1
new, 1 removed" while reconcile classified as "1 patched." Traced to
the actual cause, not a classifier bug: `vanillaRenderer.js`'s
`updateCard` sets `el.querySelector('.score').textContent = ...`, and
per the DOM spec, setting `.textContent` **always** destroys the
existing text node and creates a new one -- a `childList` remove+add,
not a `characterData` mutation -- even though nothing about the row's
structure actually changed. Solid's compiled text binding mutates an
existing text node's data in place instead. Same visible result,
genuinely different DOM cost -- exactly the gap this classifier was
built to expose.

`vanillaRenderer.js` was left unchanged rather than rewritten to dodge
this now that it's visible: doing so would make the control less
representative of ordinary vanilla-DOM code, not more, and would defeat
the point of measuring the real cost this specific (extremely common)
approach incurs.

---

## CodeRabbit findings -- 2, both real, both addressed

1. **Remove-before-add ordering bug.** `classifyMutations` judged each
   `removedNodes` entry against only the `addedNodes` seen so far in a
   single pass over the batch. A single reposition (the same node
   removed from its old spot and reinserted elsewhere) can arrive as
   separate remove/add records in either order -- browsers don't
   guarantee add-before-remove for what is logically one move -- so a
   remove-first ordering misclassified a real move as
   removed+created. Fixed with a first pass registering every
   `addedNodes` entry across the whole batch before a second pass
   judges any removal. Also stopped deleting from `knownNodes` on
   removal (a `WeakSet` doesn't need it, and deleting was the direct
   cause of the same misclassification).
2. **Seed `knownNodes` from the mounted subtree.** Both observers only
   started watching once their container ref resolved, with no
   guarantee the initial render's nodes were created *after*
   observation began rather than before -- if before, those nodes'
   creation was never delivered as a mutation record at all, so they'd
   stay permanently unregistered and their first real reposition would
   misclassify as "created." Added `seedKnownNodes()`, walking each
   container's existing subtree (including text nodes) and registering
   everything found before `observe()` is called.

---

## Verification

`npm run build` clean at every stage. Live, across multiple full server
restarts: the dev mock's built-in hou-tex pregame-to-live transition
classifies consistently (vanilla: 1 new + 1 removed; reconcile: 1
patched) both before and after the CodeRabbit fixes -- unaffected by
those fixes since it's a genuinely different text node, not a same-node
move. Layout-shift readings are real numeric values (Chromium supports
the API), 0.0000 for this specific single-row text change -- an honest
reading, not a stub. Full 7-tab sweep: zero dead sections, no console
errors. Screenshot confirmed no layout overflow from the new metric
rows.

---

## Files changed

| Path | Status |
|------|--------|
| `src/components/ControlGroup/index.jsx` | modified -- mutation-kind classifier, layout-shift observer, updated metrics table |

---

## What this does NOT change

- `vanillaRenderer.js` and `ReconcileGameList.jsx` are untouched --
  the real cost difference this PR surfaced is reported, not
  engineered away.
- Does not yet answer what happens at real production data volumes
  (500+ rows) -- the dev mock's slate stays ~8 games. The
  instrumentation is real and would apply unchanged at scale; this PR
  doesn't run that scale test.
