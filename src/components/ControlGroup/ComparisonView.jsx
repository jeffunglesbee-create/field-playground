import { Show } from 'solid-js'
import { VanillaGameList } from './VanillaGameList'
import { ReconcileGameList } from './ReconcileGameList'
import { VANILLA_LOC, RECONCILE_LOC, formatKinds } from './metrics'
import styles from './ControlGroup.module.css'

// Shared presentational shell for a vanilla-vs-reconcile comparison.
// ControlGroup (real deskStore data) and ScaleTest (500 synthetic rows)
// differ only in WHERE their games come from and their poll cadence --
// the header/panels/metrics table/paint note markup, and the two
// GameList components underneath, are identical. Extracted so a future
// change to what's displayed (a new metric row, a layout tweak) can't
// silently land on only one of the two comparisons.
//
// Props: title, note (header strings), children (intro paragraph
// content), allGames (accessor), and the object returned by
// createControlGroupMetrics() spread directly -- callers pass
// `{...metrics}` rather than naming each field, so this component and
// metrics.js's return shape can't drift out of sync unnoticed.
export function ComparisonView(props) {
  return (
    <div class={styles.root}>
      <header class={styles.header}>
        <span class={styles.label}>{props.title}</span>
        <span class={styles.note}>{props.note}</span>
      </header>
      <p class={styles.intro}>{props.children}</p>
      <div class={styles.panels}>
        <div class={styles.panel}>
          <div class={styles.panelHeader}>
            <span class={styles.panelLabel}>Vanilla DOM</span>
            <span class={styles.panelLoc}>{VANILLA_LOC} lines</span>
          </div>
          <VanillaGameList games={props.allGames} ref={props.setVanillaContainer} />
        </div>
        <div class={styles.panel}>
          <div class={styles.panelHeader}>
            <span class={styles.panelLabel}>deskStore + reconcile()</span>
            <span class={styles.panelLoc}>{RECONCILE_LOC} lines</span>
          </div>
          <ReconcileGameList games={props.allGames} ref={props.setReconcileContainer} />
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
          <span class={styles.metricVal}>{formatKinds(props.vanillaLastKinds())}</span>
          <span class={styles.metricVal}>{formatKinds(props.reconcileLastKinds())}</span>
        </div>
        <div class={styles.metricRow}>
          <span class={styles.metricLabel}>DOM mutations, avg/cycle ({props.cycles()} cycles)</span>
          <span class={styles.metricVal}>{props.vanillaAvg()}</span>
          <span class={styles.metricVal}>{props.reconcileAvg()}</span>
        </div>
        <Show
          when={props.layoutShiftSupported()}
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
            <span class={styles.metricVal}>{props.vanillaShiftLastCycle().toFixed(4)}</span>
            <span class={styles.metricVal}>{props.reconcileShiftLastCycle().toFixed(4)}</span>
          </div>
          <div class={styles.metricRow}>
            <span class={styles.metricLabel}>Layout shift, avg/cycle</span>
            <span class={styles.metricVal}>{props.vanillaShiftAvg()}</span>
            <span class={styles.metricVal}>{props.reconcileShiftAvg()}</span>
          </div>
        </Show>
        <div class={styles.metricRow}>
          <span class={styles.metricLabel}>Lines of code</span>
          <span class={styles.metricVal}>{VANILLA_LOC}</span>
          <span class={styles.metricVal}>{RECONCILE_LOC}</span>
        </div>
      </div>
      <Show when={props.paintMs() !== null}>
        <p class={styles.paintNote}>
          last cycle: {props.paintMs().toFixed(1)}ms data-change → painted frame
          (combined -- both panels update inside the same synchronous
          flush, so there's no real per-side paint moment to split)
        </p>
      </Show>
    </div>
  )
}
