import { createMemo } from 'solid-js'
import { deskStore, deskLastFetchedAt } from '../../data/relay'
import { createControlGroupMetrics } from './metrics'
import { ComparisonView } from './ComparisonView'

// The control group requested from chat's own Lab review: ~22 demos all
// passing proves "SolidJS can do this," which was never seriously in
// doubt. It doesn't measure whether reconcile() is actually BETTER than
// direct DOM manipulation for the one real surface FIELD's worst bugs
// lived in -- the polled game list. This builds that surface TWICE
// against the SAME real deskStore data, on the SAME real 15s poll
// (App.jsx's own interval calling refetchDesk() -- no separate fetch
// here), and measures what differs.
//
// The measurement (mutation-kind classification, layout-shift
// attribution, per-cycle bookkeeping) lives in metrics.js, and the
// shared header/panels/metrics-table markup lives in ComparisonView.jsx
// -- both shared with ScaleTest.jsx, the same comparison run against a
// synthetic 500-row dataset instead of real deskStore data, since every
// reading here was measured at the toy ~8-game size every other Lab
// demo already uses. See metrics.js for what each number means and how
// it's derived.
export function ControlGroup() {
  const allGames = createMemo(() => [
    ...(deskStore.games?.regular ?? []),
    ...(deskStore.games?.postseason ?? []),
  ])

  const metrics = createControlGroupMetrics(deskLastFetchedAt)

  return (
    <ComparisonView
      title="Control Group"
      note="real polled game list, built twice"
      allGames={allGames}
      {...metrics}
    >
      Same deskStore data, same real 15s poll: direct DOM manipulation
      modeled on production's actual renderCard/updateCard/render-
      signature-gate architecture, vs deskStore + reconcile(). Waits
      for the app's own poll cycle -- no separate fetch.
    </ComparisonView>
  )
}
