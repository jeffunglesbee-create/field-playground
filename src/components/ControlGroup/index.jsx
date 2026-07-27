import { createMemo, Show } from 'solid-js'
import { deskStore, deskLastFetchedAt } from '../../data/relay'
import { VanillaGameList } from './VanillaGameList'
import { ReconcileGameList } from './ReconcileGameList'
import { createControlGroupMetrics, formatKinds, VANILLA_LOC, RECONCILE_LOC } from './metrics'
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
// The measurement itself (mutation-kind classification, layout-shift
// attribution, per-cycle bookkeeping) lives in metrics.js, shared with
// ScaleTest.jsx -- the same comparison run against a synthetic 500-row
// dataset instead of real deskStore data, since every metric here was
// measured at the toy ~8-game size every other Lab demo already uses.
// See metrics.js for what each number means and how it's derived.

export function ControlGroup() {
  const allGames = createMemo(() => [
    ...(deskStore.games?.regular ?? []),
    ...(deskStore.games?.postseason ?? []),
  ])

  const {
    setVanillaContainer, setReconcileContainer,
    vanillaLastKinds, reconcileLastKinds,
    vanillaAvg, reconcileAvg,
    vanillaShiftLastCycle, reconcileShiftLastCycle,
    vanillaShiftAvg, reconcileShiftAvg,
    layoutShiftSupported, cycles, paintMs,
  } = createControlGroupMetrics(deskLastFetchedAt)

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
