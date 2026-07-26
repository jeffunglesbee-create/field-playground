import { For, createSignal, createMemo, createEffect, onMount } from 'solid-js'
import { deskStore } from '../../data/relay'
import styles from './ReorderCost.module.css'

// Does Solid's keyed <For> MOVE existing DOM nodes when the array is
// REORDERED (same object references, different positions), or does it
// tear down and rebuild rows? ReactivePerfPanel already proved
// reconcile() patches VALUE changes on stable objects without remounting
// -- that's a different question from this one, which is specifically
// about POSITION changes on the SAME stable references, something
// nothing in this repo has measured before. Production's gamecard has a
// real sort control (↑); this instruments what that control actually
// costs, with real mount/compute counters bumped from inside each row's
// own onMount/createEffect, not an assumption about how <For> works.

function allGames() {
  return [...(deskStore.games?.regular ?? []), ...(deskStore.games?.postseason ?? [])]
}

function gameStatus(g) {
  if (g.home_score === null) return 'pre'
  if (g.finalized_at) return g.went_to_ot ? 'final_ot' : 'final'
  return 'live'
}

function margin(g) {
  if (g.home_score == null || g.away_score == null) return -1
  return Math.abs(g.home_score - g.away_score)
}

const SORTS = [
  { key: 'slate', label: 'slate order', fn: null },
  { key: 'alpha', label: 'alphabetical', fn: (a, b) => a.home.localeCompare(b.home) },
  { key: 'margin', label: 'score margin', fn: (a, b) => margin(b) - margin(a) },
  { key: 'sport', label: 'by sport', fn: (a, b) => a.sport.localeCompare(b.sport) },
]

function Row(props) {
  const [mounts, setMounts] = createSignal(0)
  const [computes, setComputes] = createSignal(0)
  onMount(() => { setMounts(m => m + 1); props.bumpMount() })
  createEffect(() => {
    // Reading these fields is what makes this a real tracked
    // computation, same posture as ReactivePerfPanel's Row -- a reorder
    // alone touches neither field, so if <For> is moving nodes rather
    // than remounting, this effect should NOT re-fire on a pure reorder.
    void props.game.home_score
    void props.game.away_score
    setComputes(c => c + 1)
    props.bumpCompute()
  })
  return (
    <div class={styles.row}>
      <span class={`${styles.dot} ${styles[gameStatus(props.game)]}`} />
      <span class={styles.matchup}>{props.game.away} @ {props.game.home}</span>
      <span class={styles.counts}>m{mounts()} · c{computes()}</span>
    </div>
  )
}

export function ReorderCost() {
  const games = createMemo(allGames)
  const [sortKey, setSortKey] = createSignal('slate')
  const [order, setOrder] = createSignal([])

  // Re-sorts whenever the underlying slate changes (a poll cycle) OR the
  // chosen sort changes -- except while sortKey is 'shuffle', which has
  // no comparator and is a discrete, explicit action (see shuffleNow),
  // not a continuously-reactive derivation. .slice() before .sort():
  // sort() mutates in place, and mutating games()'s own cached array
  // would corrupt every OTHER consumer of that memo, not just this one.
  createEffect(() => {
    const spec = SORTS.find(s => s.key === sortKey())
    if (!spec?.fn && spec?.key !== 'slate') return
    setOrder(spec.fn ? games().slice().sort(spec.fn) : games().slice())
  })

  function shuffleNow() {
    setSortKey('shuffle')
    const arr = games().slice()
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1))
      ;[arr[i], arr[j]] = [arr[j], arr[i]]
    }
    setOrder(arr)
  }

  const [totalMounts, setTotalMounts] = createSignal(0)
  const [totalComputes, setTotalComputes] = createSignal(0)

  return (
    <div class={styles.root}>
      <header class={styles.header}>
        <span class={styles.label}>Reorder Cost</span>
        <span class={styles.sublabel}>does &lt;For&gt; move nodes or remount on reorder?</span>
      </header>
      <p class={styles.note}>
        Real mount/compute counters per row (m# · c#). If total mounts stops growing after the
        first sort while total computes only grows on actual score changes, &lt;For&gt; is moving
        the same DOM nodes to their new position, not rebuilding them.
      </p>
      <div class={styles.sortRow}>
        <For each={SORTS}>
          {s => (
            <button
              type="button"
              class={styles.sortBtn}
              data-active={sortKey() === s.key}
              onClick={() => setSortKey(s.key)}
            >
              {s.label}
            </button>
          )}
        </For>
        <button type="button" class={styles.sortBtn} data-active={sortKey() === 'shuffle'} onClick={shuffleNow}>
          shuffle
        </button>
      </div>
      <div class={styles.totals}>
        total mounts: {totalMounts()} · total computes: {totalComputes()}
      </div>
      <div class={styles.rowList}>
        <For each={order()}>
          {g => (
            <Row
              game={g}
              bumpMount={() => setTotalMounts(m => m + 1)}
              bumpCompute={() => setTotalComputes(c => c + 1)}
            />
          )}
        </For>
      </div>
    </div>
  )
}
