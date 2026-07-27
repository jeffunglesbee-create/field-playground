import { createSignal, createEffect, createMemo, onMount, onCleanup, Show } from 'solid-js'
import { deskStore, deskLastFetchedAt } from '../../data/relay'
import { VanillaGameList } from './VanillaGameList'
import { ReconcileGameList } from './ReconcileGameList'
import styles from './ControlGroup.module.css'

// The control group requested from chat's own Lab review: ~22 demos all
// passing proves "SolidJS can do this," which was never seriously in
// doubt. It doesn't measure whether reconcile() is actually BETTER than
// direct DOM manipulation for the one real surface FIELD's worst bugs
// lived in -- the polled game list. This builds that surface TWICE
// against the SAME real deskStore data, on the SAME real 15s poll
// (App.jsx's own interval calling refetchDesk() -- no separate fetch
// here), and measures what differs.
//
// Metrics, each honestly scoped to what's actually comparable:
// - DOM op kind/cycle: classifyMutations() below, derived purely from
//   observed MutationObserver records, not from either renderer's own
//   bookkeeping -- applies identically and fairly to both panels even
//   though <For>'s internals are opaque from here. Replaces a plain
//   mutation COUNT: chat's own independent review of this component
//   (2026-07-27) found that equal counts can carry very different
//   reflow cost -- an inserted node and a moved node both show up as a
//   childList addition, but only one forces the browser to lay out a
//   new subtree. Kind, not count, is the actual comparison.
// - Layout shift/cycle: a shared PerformanceObserver on 'layout-shift'
//   entries, attributed to whichever panel's container contains the
//   entry's source node(s) (LayoutShiftAttribution exposes the actual
//   shifted element, so per-panel attribution is real, not guessed).
//   This is the numeric version of what a human tester reported by eye
//   (Solid visibly smoother) that DOM-mutation count alone couldn't
//   explain.
// - Lines of code: counted directly from the two implementation files
//   (wc -l, 2026-07-27), not estimated.
// - Time-to-paint: both panels update inside the SAME synchronous
//   reactive flush (the same setDeskStore(reconcile(json)) call drives
//   both), so there is no real per-side paint moment to separate --
//   only one combined "data change -> painted frame" number, via a
//   double-requestAnimationFrame measurement (the standard technique:
//   the first rAF fires just before the browser paints the current
//   frame, the second fires only after that paint has actually
//   happened).
//
// LOC counted 2026-07-27 via `wc -l`: vanillaRenderer.js (111 lines,
// whole file) vs ReconcileGameList.jsx (39 lines, whole file) -- both
// totals include their own header comments in equal proportion, not
// stripped selectively to flatter either side.
const VANILLA_LOC = 111
const RECONCILE_LOC = 39

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
function classifyMutations(records, knownNodes) {
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
// started. Depending on exact onMount/effect ordering between this
// component and its two children, the initial render's nodes could in
// principle already exist before observe() is called -- in which case
// their creation was never delivered as a mutation record at all, and
// without this seed they'd stay permanently unregistered, so their
// first real reposition would misclassify as "created" instead of
// "moved." Walking the subtree once up front removes the dependency on
// that ordering entirely. Includes text nodes (SHOW_ALL, not just
// elements): score text changes are text-node level, not element level.
function seedKnownNodes(container, knownNodes) {
  const walker = document.createTreeWalker(container, NodeFilter.SHOW_ALL)
  let node
  while ((node = walker.nextNode())) knownNodes.add(node)
}

// A real result this classifier surfaced, confirmed live, worth stating
// so "1 new · 1 removed" for the vanilla panel isn't misread as a
// classifier bug: updateCard patches a score via
// `el.querySelector('.score').textContent = ...`. Per the DOM spec,
// setting .textContent always destroys the element's existing text
// node and creates a brand new one -- it's a childList remove+add, not
// a characterData mutation, even though nothing about the row's
// structure actually changed. Solid's compiled text binding instead
// mutates an existing text node's own data in place (confirmed by the
// reconcile panel classifying the identical score change as a single
// "patched" -- characterData). Same visible result, genuinely different
// DOM cost -- exactly the count-vs-kind gap this classifier exists to
// expose, not something to tune away by rewriting vanillaRenderer.js to
// dodge it once it became visible.
const EMPTY_KINDS = { created: 0, moved: 0, removed: 0, patched: 0 }

function formatKinds(k) {
  const parts = []
  if (k.created) parts.push(`${k.created} new`)
  if (k.moved) parts.push(`${k.moved} moved`)
  if (k.patched) parts.push(`${k.patched} patched`)
  if (k.removed) parts.push(`${k.removed} removed`)
  return parts.length ? parts.join(' · ') : '—'
}

export function ControlGroup() {
  const allGames = createMemo(() => [
    ...(deskStore.games?.regular ?? []),
    ...(deskStore.games?.postseason ?? []),
  ])

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

    // Fires once per real POLL (tracks relay.js's deskLastFetchedAt,
    // which fetchDeskReconciled stamps unconditionally on every
    // successful fetch), not once per "the reconciled data happened to
    // look different." An earlier version of this effect tracked
    // allGames() instead -- the memo built from spreading
    // deskStore.games.regular/postseason -- reasoning that a poll with
    // no visible change is fine to skip. That turned out to be
    // unreliable: verified directly against the dev mock's built-in
    // pregame-to-live transition (hou-tex, request #2) that a
    // allGames()-tracking effect sometimes missed a real, DOM-confirmed
    // change (MutationObserver counted real mutations in both panels
    // while this effect's own cycle counter stayed at 0) and sometimes
    // caught it, with no code difference between runs -- a sign the
    // memo's identity-change semantics aren't a dependable trigger here.
    // deskLastFetchedAt changes on every real fetch, independent of
    // whether reconcile() found anything to patch, so it can't miss a
    // cycle the way tracking the memo did.
    //
    // Skips the very first run (initial mount, not a poll "cycle") so
    // cycle count and averages reflect actual poll-driven updates only.
    // Also zeroes the DOM/layout-shift counters at that boundary:
    // initial mount populates both panels from empty, and those
    // mutations are mount noise, not a poll cycle -- left uncleared, the
    // first "last cycle" reading would show whatever the two panels'
    // mount order happened to produce and could be misread as a real
    // mechanism difference. The reset itself has to wait two animation
    // frames, not fire inline: MutationObserver callbacks are always
    // async (queued as a microtask), so the mount's own batch hasn't
    // been delivered yet at the moment this synchronous effect runs --
    // resetting immediately would just get overwritten a tick later
    // when that batch finally arrives. Two rAFs land after the paint
    // that follows the mount, well after any microtask queued that same
    // turn.
    let firstRun = true
    createEffect(() => {
      deskLastFetchedAt()
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
      // A poll with zero mutations never fires the MutationObserver
      // callback, so without this reset "last cycle" would keep
      // displaying whatever the PREVIOUS changed poll left behind --
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

  return (
    <div class={styles.root}>
      <header class={styles.header}>
        <span class={styles.label}>Control Group</span>
        <span class={styles.note}>real polled game list, built twice</span>
      </header>
      <p class={styles.intro}>
        Same deskStore data, same real 15s poll: direct DOM manipulation
        modeled on production's actual renderCard/updateCard/render-
        signature-gate architecture, vs deskStore + reconcile(). Waits
        for the app's own poll cycle -- no separate fetch.
      </p>
      <div class={styles.panels}>
        <div class={styles.panel}>
          <div class={styles.panelHeader}>
            <span class={styles.panelLabel}>Vanilla DOM</span>
            <span class={styles.panelLoc}>{VANILLA_LOC} lines</span>
          </div>
          <VanillaGameList games={allGames} ref={setVanillaContainer} />
        </div>
        <div class={styles.panel}>
          <div class={styles.panelHeader}>
            <span class={styles.panelLabel}>deskStore + reconcile()</span>
            <span class={styles.panelLoc}>{RECONCILE_LOC} lines</span>
          </div>
          <ReconcileGameList games={allGames} ref={setReconcileContainer} />
        </div>
      </div>
      <div class={styles.metrics}>
        <div class={styles.metricHead}>
          <span />
          <span class={styles.metricHeadCol}>Vanilla</span>
          <span class={styles.metricHeadCol}>Reconcile</span>
        </div>
        <div class={styles.metricRow}>
          <span class={styles.metricLabel}>DOM ops, last cycle</span>
          <span class={styles.metricVal}>{formatKinds(vanillaLastKinds())}</span>
          <span class={styles.metricVal}>{formatKinds(reconcileLastKinds())}</span>
        </div>
        <div class={styles.metricRow}>
          <span class={styles.metricLabel}>DOM mutations, avg/cycle ({cycles()} cycles)</span>
          <span class={styles.metricVal}>{vanillaAvg()}</span>
          <span class={styles.metricVal}>{reconcileAvg()}</span>
        </div>
        <Show
          when={layoutShiftSupported()}
          fallback={
            <div class={styles.metricRow}>
              <span class={styles.metricLabel}>Layout shift</span>
              <span class={styles.metricVal}>n/a</span>
              <span class={styles.metricVal}>n/a</span>
            </div>
          }
        >
          <div class={styles.metricRow}>
            <span class={styles.metricLabel}>Layout shift, last cycle</span>
            <span class={styles.metricVal}>{vanillaShiftLastCycle().toFixed(4)}</span>
            <span class={styles.metricVal}>{reconcileShiftLastCycle().toFixed(4)}</span>
          </div>
          <div class={styles.metricRow}>
            <span class={styles.metricLabel}>Layout shift, avg/cycle</span>
            <span class={styles.metricVal}>{vanillaShiftAvg()}</span>
            <span class={styles.metricVal}>{reconcileShiftAvg()}</span>
          </div>
        </Show>
        <div class={styles.metricRow}>
          <span class={styles.metricLabel}>Lines of code</span>
          <span class={styles.metricVal}>{VANILLA_LOC}</span>
          <span class={styles.metricVal}>{RECONCILE_LOC}</span>
        </div>
      </div>
      <Show when={paintMs() !== null}>
        <p class={styles.paintNote}>
          last cycle: {paintMs().toFixed(1)}ms data-change → painted frame
          (combined -- both panels update inside the same synchronous
          flush, so there's no real per-side paint moment to split)
        </p>
      </Show>
    </div>
  )
}
