import { createSignal, createEffect, createMemo, onMount, onCleanup } from 'solid-js'

// LOC counted 2026-07-27 via `wc -l`: vanillaRenderer.js (111 lines,
// whole file) vs ReconcileGameList.jsx (39 lines, whole file) -- both
// totals include their own header comments in equal proportion, not
// stripped selectively to flatter either side. Hoisted here (not
// duplicated as a literal in both ControlGroup/index.jsx and
// ScaleTest.jsx) since both display the same underlying files' size.
export const VANILLA_LOC = 111
export const RECONCILE_LOC = 39

// Classifies MutationObserver records into created/moved/patched/
// removed. A childList addedNodes entry alone can't tell you which --
// it's the SAME shape whether the node is brand new or was already on
// screen and just changed position. Tracking which node references have
// been seen before (knownNodes, persisted across cycles by the caller)
// is what actually distinguishes them: a node this observer has never
// seen is created; a node it HAS seen, reappearing in addedNodes, was
// moved. characterData/attributes mutations patch an existing node in
// place -- the cheapest kind, no layout consequence beyond the changed
// node itself.
//
// Two passes over the batch, not one: a single reposition (the SAME
// node removed from its old spot and reinserted at a new one) can
// arrive as separate remove/add records in EITHER order -- browsers
// don't guarantee add-before-remove for what is logically one move.
// A one-pass classifier that judges each removedNodes entry against
// only the addedNodes seen SO FAR would misclassify a move as
// removed+created whenever the remove record happens to come first.
// Registering every addedNodes entry across the WHOLE batch before
// judging any removal closes that ordering dependency. Also: knownNodes
// is never deleted on removal. It's a WeakSet, so a truly-gone node is
// still garbage collected once nothing else references it (this
// module's own renderAll always creates a fresh element for a
// reappearing game id rather than resurrecting a removed one) --
// deleting here bought nothing and was the direct cause of the same
// remove-before-add misclassification for legitimate same-batch moves.
export function classifyMutations(records, knownNodes) {
  let created = 0, moved = 0, removed = 0, patched = 0
  const addedThisBatch = new Set()
  for (const record of records) {
    if (record.type !== 'childList') continue
    for (const node of record.addedNodes) addedThisBatch.add(node)
  }
  for (const record of records) {
    if (record.type === 'characterData' || record.type === 'attributes') {
      patched++
      continue
    }
    if (record.type !== 'childList') continue
    for (const node of record.addedNodes) {
      if (knownNodes.has(node)) moved++
      else { created++; knownNodes.add(node) }
    }
    for (const node of record.removedNodes) {
      if (!addedThisBatch.has(node)) removed++
    }
  }
  return { created, moved, removed, patched }
}

// Seeds knownNodes from whatever a container already holds at the
// moment its observer is set up, rather than relying on every existing
// descendant having been freshly created (and thus already registered
// via classifyMutations' own "created" branch) after observation
// started. Depending on exact onMount/effect ordering between the
// calling component and its children, the initial render's nodes could
// in principle already exist before observe() is called -- in which
// case their creation was never delivered as a mutation record at all,
// and without this seed they'd stay permanently unregistered, so their
// first real reposition would misclassify as "created" instead of
// "moved." Walking the subtree once up front removes the dependency on
// that ordering entirely. Includes text nodes (SHOW_ALL, not just
// elements): score text changes are text-node level, not element level.
export function seedKnownNodes(container, knownNodes) {
  const walker = document.createTreeWalker(container, NodeFilter.SHOW_ALL)
  let node
  while ((node = walker.nextNode())) knownNodes.add(node)
}

// A real result this classifier surfaced against real deskStore data,
// confirmed live, worth stating so "1 new · 1 removed" isn't misread as
// a classifier bug: vanillaRenderer.js's updateCard patches a score via
// `el.querySelector('.score').textContent = ...`. Per the DOM spec,
// setting .textContent always destroys the element's existing text
// node and creates a brand new one -- it's a childList remove+add, not
// a characterData mutation, even though nothing about the row's
// structure actually changed. Solid's compiled text binding instead
// mutates an existing text node's own data in place. Same visible
// result, genuinely different DOM cost -- exactly the count-vs-kind gap
// this classifier exists to expose.
export const EMPTY_KINDS = { created: 0, moved: 0, removed: 0, patched: 0 }

export function formatKinds(k) {
  const parts = []
  if (k.created) parts.push(`${k.created} new`)
  if (k.moved) parts.push(`${k.moved} moved`)
  if (k.patched) parts.push(`${k.patched} patched`)
  if (k.removed) parts.push(`${k.removed} removed`)
  return parts.length ? parts.join(' · ') : '—'
}

// Shared instrumentation for a vanilla-vs-reconcile comparison: two
// MutationObservers (one per panel, classified by kind via
// classifyMutations), a shared layout-shift PerformanceObserver
// (attributed per-panel via each entry's real `sources`), and per-cycle
// bookkeeping (reset-on-cycle-start, running averages). Extracted out of
// ControlGroup/index.jsx so ScaleTest.jsx (the same comparison at
// synthetic volume, not real deskStore data) can reuse the identical
// measurement logic rather than a second, potentially-diverging copy --
// the whole point of a control group is that both cases being compared
// share every mechanism except the one thing under test.
//
// `cycleTrigger` is an accessor read once per real "cycle" this
// instrument should count -- ControlGroup passes relay.js's
// deskLastFetchedAt (stamped on every real poll); ScaleTest passes its
// own synthetic poll signal. Either way, the first invocation is
// treated as initial mount noise (discarded), not a cycle.
export function createControlGroupMetrics(cycleTrigger) {
  const [vanillaContainer, setVanillaContainer] = createSignal(null)
  const [reconcileContainer, setReconcileContainer] = createSignal(null)

  const [vanillaLastKinds, setVanillaLastKinds] = createSignal(EMPTY_KINDS)
  const [reconcileLastKinds, setReconcileLastKinds] = createSignal(EMPTY_KINDS)
  const [vanillaTotal, setVanillaTotal] = createSignal(0)
  const [reconcileTotal, setReconcileTotal] = createSignal(0)
  const [cycles, setCycles] = createSignal(0)
  const [paintMs, setPaintMs] = createSignal(null)

  const [vanillaShiftLastCycle, setVanillaShiftLastCycle] = createSignal(0)
  const [reconcileShiftLastCycle, setReconcileShiftLastCycle] = createSignal(0)
  const [vanillaShiftTotal, setVanillaShiftTotal] = createSignal(0)
  const [reconcileShiftTotal, setReconcileShiftTotal] = createSignal(0)
  const [layoutShiftSupported, setLayoutShiftSupported] = createSignal(true)

  onMount(() => {
    // Persisted across the whole observer's lifetime (not per-cycle) --
    // a node created in cycle 1 and merely repositioned in cycle 3 must
    // still classify as "moved," not "created" again.
    const vanillaKnownNodes = new WeakSet()
    const reconcileKnownNodes = new WeakSet()

    createEffect(() => {
      const vc = vanillaContainer()
      if (!vc) return
      seedKnownNodes(vc, vanillaKnownNodes)
      const observer = new MutationObserver((records) => {
        setVanillaLastKinds(classifyMutations(records, vanillaKnownNodes))
        setVanillaTotal((t) => t + records.length)
      })
      observer.observe(vc, { childList: true, attributes: true, characterData: true, subtree: true })
      onCleanup(() => observer.disconnect())
    })

    createEffect(() => {
      const rc = reconcileContainer()
      if (!rc) return
      seedKnownNodes(rc, reconcileKnownNodes)
      const observer = new MutationObserver((records) => {
        setReconcileLastKinds(classifyMutations(records, reconcileKnownNodes))
        setReconcileTotal((t) => t + records.length)
      })
      observer.observe(rc, { childList: true, attributes: true, characterData: true, subtree: true })
      onCleanup(() => observer.disconnect())
    })

    // Layout Instability API is page-wide by nature (one shift score per
    // frame, not per element) -- but each entry's `sources` array names
    // the actual DOM node(s) that moved (LayoutShiftAttribution), so
    // per-panel attribution here is real measurement, not a guess:
    // check which container each shifted node falls under. Not
    // supported everywhere (notably Safari), so this degrades to
    // "unsupported" rather than silently reporting a fake 0.
    if (typeof PerformanceObserver === 'undefined' || !PerformanceObserver.supportedEntryTypes?.includes('layout-shift')) {
      setLayoutShiftSupported(false)
    } else {
      try {
        const shiftObserver = new PerformanceObserver((list) => {
          const vc = vanillaContainer(), rc = reconcileContainer()
          if (!vc || !rc) return
          for (const entry of list.getEntries()) {
            if (entry.hadRecentInput) continue
            let inVanilla = false, inReconcile = false
            for (const source of entry.sources ?? []) {
              if (!source.node) continue
              if (vc.contains(source.node)) inVanilla = true
              if (rc.contains(source.node)) inReconcile = true
            }
            if (inVanilla) {
              setVanillaShiftLastCycle((v) => v + entry.value)
              setVanillaShiftTotal((v) => v + entry.value)
            }
            if (inReconcile) {
              setReconcileShiftLastCycle((v) => v + entry.value)
              setReconcileShiftTotal((v) => v + entry.value)
            }
          }
        })
        shiftObserver.observe({ type: 'layout-shift', buffered: false })
        onCleanup(() => shiftObserver.disconnect())
      } catch {
        setLayoutShiftSupported(false)
      }
    }

    // Fires once per real cycle (cycleTrigger changes), not once per
    // "the reconciled data happened to look different." An earlier
    // version of ControlGroup tracked the reconciled game-list's own
    // memo instead, reasoning that a cycle with no visible change is
    // fine to skip. That turned out to be unreliable: verified directly
    // against the dev mock's built-in pregame-to-live transition that a
    // memo-tracking effect sometimes missed a real, DOM-confirmed change
    // (MutationObserver counted real mutations in both panels while
    // that effect's own cycle counter stayed at 0) and sometimes caught
    // it, with no code difference between runs -- a sign the memo's
    // identity-change semantics aren't a dependable trigger. A signal
    // the caller bumps unconditionally on every real cycle can't miss
    // one the way tracking reconciled data did.
    //
    // Skips the very first run (initial mount, not a cycle) so cycle
    // count and averages reflect actual cycle-driven updates only. Also
    // zeroes the DOM/layout-shift counters at that boundary: initial
    // mount populates both panels from empty, and those mutations are
    // mount noise, not a cycle -- left uncleared, the first "last cycle"
    // reading would show whatever the two panels' mount order happened
    // to produce and could be misread as a real mechanism difference.
    // The reset itself has to wait two animation frames, not fire
    // inline: MutationObserver callbacks are always async (queued as a
    // microtask), so the mount's own batch hasn't been delivered yet at
    // the moment this synchronous effect runs -- resetting immediately
    // would just get overwritten a tick later when that batch finally
    // arrives. Two rAFs land after the paint that follows the mount,
    // well after any microtask queued that same turn.
    let firstRun = true
    createEffect(() => {
      cycleTrigger()
      if (firstRun) {
        firstRun = false
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            setVanillaTotal(0)
            setReconcileTotal(0)
            setVanillaLastKinds(EMPTY_KINDS)
            setReconcileLastKinds(EMPTY_KINDS)
            setVanillaShiftLastCycle(0)
            setReconcileShiftLastCycle(0)
            setVanillaShiftTotal(0)
            setReconcileShiftTotal(0)
          })
        })
        return
      }
      // A cycle with zero mutations never fires the MutationObserver
      // callback, so without this reset "last cycle" would keep
      // displaying whatever the PREVIOUS changed cycle left behind --
      // an unchanged cycle needs to actually show 0/empty, not stale
      // numbers. Same reasoning for layout shift.
      setVanillaLastKinds(EMPTY_KINDS)
      setReconcileLastKinds(EMPTY_KINDS)
      setVanillaShiftLastCycle(0)
      setReconcileShiftLastCycle(0)
      setCycles((c) => c + 1)
      const t0 = performance.now()
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          setPaintMs(performance.now() - t0)
        })
      })
    })
  })

  const vanillaAvg = createMemo(() => (cycles() > 0 ? (vanillaTotal() / cycles()).toFixed(1) : '—'))
  const reconcileAvg = createMemo(() => (cycles() > 0 ? (reconcileTotal() / cycles()).toFixed(1) : '—'))
  const vanillaShiftAvg = createMemo(() => (cycles() > 0 ? (vanillaShiftTotal() / cycles()).toFixed(4) : '—'))
  const reconcileShiftAvg = createMemo(() => (cycles() > 0 ? (reconcileShiftTotal() / cycles()).toFixed(4) : '—'))

  return {
    vanillaContainer, setVanillaContainer,
    reconcileContainer, setReconcileContainer,
    vanillaLastKinds, reconcileLastKinds,
    vanillaAvg, reconcileAvg,
    vanillaShiftLastCycle, reconcileShiftLastCycle,
    vanillaShiftAvg, reconcileShiftAvg,
    layoutShiftSupported,
    cycles, paintMs,
  }
}
