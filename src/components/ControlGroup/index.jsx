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
// Two metrics are cleanly separable per side; one isn't, and this says
// so rather than fabricating a false split:
// - DOM mutations/cycle: a real MutationObserver per panel. Genuinely
//   independent, genuinely comparable.
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
// LOC counted 2026-07-27 via `wc -l`: vanillaRenderer.js (90 lines,
// whole file) vs ReconcileGameList.jsx (39 lines, whole file) -- both
// totals include their own header comments in equal proportion, not
// stripped selectively to flatter either side.
const VANILLA_LOC = 90
const RECONCILE_LOC = 39

export function ControlGroup() {
  const allGames = createMemo(() => [
    ...(deskStore.games?.regular ?? []),
    ...(deskStore.games?.postseason ?? []),
  ])

  const [vanillaContainer, setVanillaContainer] = createSignal(null)
  const [reconcileContainer, setReconcileContainer] = createSignal(null)

  const [vanillaLastBatch, setVanillaLastBatch] = createSignal(0)
  const [reconcileLastBatch, setReconcileLastBatch] = createSignal(0)
  const [vanillaTotal, setVanillaTotal] = createSignal(0)
  const [reconcileTotal, setReconcileTotal] = createSignal(0)
  const [cycles, setCycles] = createSignal(0)
  const [paintMs, setPaintMs] = createSignal(null)

  onMount(() => {
    createEffect(() => {
      const vc = vanillaContainer()
      if (!vc) return
      const observer = new MutationObserver((records) => {
        setVanillaLastBatch(records.length)
        setVanillaTotal((t) => t + records.length)
      })
      observer.observe(vc, { childList: true, attributes: true, characterData: true, subtree: true })
      onCleanup(() => observer.disconnect())
    })

    createEffect(() => {
      const rc = reconcileContainer()
      if (!rc) return
      const observer = new MutationObserver((records) => {
        setReconcileLastBatch(records.length)
        setReconcileTotal((t) => t + records.length)
      })
      observer.observe(rc, { childList: true, attributes: true, characterData: true, subtree: true })
      onCleanup(() => observer.disconnect())
    })

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
    // Also zeroes the DOM-mutation counters at that boundary: initial
    // mount populates both panels from empty, and those mutations are
    // mount noise, not a poll cycle -- left uncleared, the first "last
    // cycle" reading would show whatever the two panels' mount order
    // happened to produce and could be misread as a real mechanism
    // difference. The reset itself has to wait two animation frames,
    // not fire inline: MutationObserver callbacks are always async
    // (queued as a microtask), so the mount's own batch hasn't been
    // delivered yet at the moment this synchronous effect runs --
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
            setVanillaLastBatch(0)
            setReconcileLastBatch(0)
          })
        })
        return
      }
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
          <span class={styles.metricLabel}>DOM mutations, last cycle</span>
          <span class={styles.metricVal}>{vanillaLastBatch()}</span>
          <span class={styles.metricVal}>{reconcileLastBatch()}</span>
        </div>
        <div class={styles.metricRow}>
          <span class={styles.metricLabel}>DOM mutations, avg/cycle ({cycles()} cycles)</span>
          <span class={styles.metricVal}>{vanillaAvg()}</span>
          <span class={styles.metricVal}>{reconcileAvg()}</span>
        </div>
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
