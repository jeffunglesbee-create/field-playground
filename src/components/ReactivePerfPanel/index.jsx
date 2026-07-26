import { For, Show, createSignal, createMemo, createEffect, onMount, untrack } from 'solid-js'
import { deskStore, deskLastFetchedAt } from '../../data/relay'
import { perfCounts, bumpPerfCount, resetPerfCounts } from '../../data/reactivePerf'
import styles from './ReactivePerfPanel.module.css'

// Every existing proof in this repo that reconciliation beats remounting
// (DeskCard's own mountCounts label, docs/EXPERIMENT-live-reconciliation.md)
// only shows DOM node identity -- true or false, never a number. This
// makes the cost visible as one: two parallel <For> lists fed the exact
// same real deskStore data every poll cycle. "reconciled" keeps stable
// object identity across polls (the actual store proxy objects, patched
// in place -- how DeskCard's own reconcile() really behaves). "remounted"
// deliberately re-spreads every game into a brand-new plain object every
// poll, so <For>'s reference-based diffing can't recognize any of them
// and tears down + rebuilds every row regardless of whether that game's
// data changed. The counts below are real createEffect fires bumped from
// inside each row, not an estimate.
//
// Deliberately does not touch DeskCard's actual GameRow -- this is a
// parallel, additive instrumentation graph over the same data, not a
// modification of the production render path.

function allGames() {
  return [...(deskStore.games?.regular ?? []), ...(deskStore.games?.postseason ?? [])]
}

function Row(props) {
  onMount(() => bumpPerfCount(props.strategy, props.id, 'mount'))
  createEffect(() => {
    // Reading these fields is what makes this a real, tracked
    // computation. For "reconciled", props.game is the live store proxy,
    // so this only re-fires when THESE fields actually change on THAT
    // object. For "remounted", props.game is a plain spread snapshot
    // with no reactivity of its own -- this effect runs its one
    // guaranteed first-run, then the whole row (and this effect) is
    // disposed and recreated from scratch next poll cycle.
    void props.game.home_score
    void props.game.away_score
    bumpPerfCount(props.strategy, props.id, 'compute')
  })
  const counts = () => perfCounts[props.strategy]?.[props.id]
  return (
    <div class={styles.perfRow}>
      <span class={styles.perfRowLabel}>{props.game.away} @ {props.game.home}</span>
      <span class={styles.perfRowCount}>m{counts()?.mounts ?? 0} · c{counts()?.computes ?? 0}</span>
    </div>
  )
}

function sumField(strategyCounts, field) {
  return Object.values(strategyCounts).reduce((a, c) => a + (c?.[field] ?? 0), 0)
}

export function ReactivePerfPanel() {
  // Both lists explicitly depend on deskLastFetchedAt -- the same
  // poll-cycle-boundary signal WorkerBridgeDemo/PollDeltaFeed/scoreEvents
  // already key off -- rather than on deskStore.games' own array
  // identity. Reconcile() patches an unchanged game's fields via a
  // nested property write, which never touches the array's own index
  // slots or length, so a memo that only depended on the array itself
  // would silently stop re-running the moment a poll cycle didn't add or
  // remove a game -- exactly the failure this panel exists to make
  // visible would go uninstrumented. Depending on the poll signal
  // directly guarantees both lists actually re-evaluate every cycle.
  const reconciledList = createMemo(() => {
    deskLastFetchedAt()
    return allGames()
  })
  const remountedList = createMemo(() => {
    deskLastFetchedAt()
    return allGames().map(g => ({ ...g }))
  })

  const totals = createMemo(() => ({
    reconciled: sumField(perfCounts.reconciled, 'computes'),
    remounted: sumField(perfCounts.remounted, 'computes'),
  }))

  const [lastCycle, setLastCycle] = createSignal({ reconciled: 0, remounted: 0 })
  const [cycleDelta, setCycleDelta] = createSignal({ reconciled: 0, remounted: 0 })

  createEffect(() => {
    const fetchedAt = deskLastFetchedAt()
    if (fetchedAt == null) return
    // Tracks ONLY deskLastFetchedAt -- totals() and lastCycle() are read
    // untracked so this effect fires exactly once per poll-cycle
    // boundary, not once per individual computation bump (which would
    // defeat the point of measuring "per cycle" at all).
    const now = untrack(totals)
    const prev = untrack(lastCycle)
    setCycleDelta({ reconciled: now.reconciled - prev.reconciled, remounted: now.remounted - prev.remounted })
    setLastCycle(now)
  })

  function handleReset() {
    resetPerfCounts()
    setLastCycle({ reconciled: 0, remounted: 0 })
    setCycleDelta({ reconciled: 0, remounted: 0 })
  }

  return (
    <details class={styles.root}>
      <summary class={styles.summary}>
        <span class={styles.label}>Reactive Cost</span>
        <span class={styles.summaryStat}>
          last cycle: reconciled +{cycleDelta().reconciled} · remounted +{cycleDelta().remounted}
        </span>
      </summary>
      <p class={styles.note}>
        Two &lt;For&gt; lists, identical real game data. "reconciled" keeps stable object identity
        across polls the way DeskCard's own reconcile() actually behaves — rows only recompute when
        their own fields change. "remounted" re-spreads every game into a fresh object every poll —
        every row recomputes regardless. Counts are real createEffect fires, not estimates.
      </p>
      <div class={styles.totalsRow}>
        <span class={styles.totalChip}>reconciled total: {totals().reconciled}</span>
        <span class={styles.totalChip}>remounted total: {totals().remounted}</span>
        <button type="button" class={styles.resetBtn} onClick={handleReset}>reset</button>
      </div>
      <Show when={reconciledList().length} fallback={<p class={styles.empty}>No games this cycle.</p>}>
        <div class={styles.columns}>
          <div class={styles.column}>
            <div class={styles.columnLabel}>reconciled</div>
            <For each={reconciledList()}>{g => <Row game={g} id={g.id} strategy="reconciled" />}</For>
          </div>
          <div class={styles.column}>
            <div class={styles.columnLabel}>remounted</div>
            <For each={remountedList()}>{g => <Row game={g} id={g.id} strategy="remounted" />}</For>
          </div>
        </div>
      </Show>
    </details>
  )
}
