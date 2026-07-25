import { createSelector, createSignal, createEffect, For } from 'solid-js'
import { createStore } from 'solid-js/store'
import styles from './SelectorDemo.module.css'

// createSelector: O(1) selected-item tracking.
//
// Without createSelector:
//   const isActive = (id) => selected() === id
//   Every row subscribes to `selected()`. When selected changes, ALL N rows
//   re-evaluate their isActive check — O(N) reactive evaluations per click.
//
// With createSelector:
//   const isActive = createSelector(selected)
//   isActive(id) creates a per-item subscription that fires ONLY when that
//   specific item gains or loses selection — O(1) per click: exactly 2 rows
//   update (the old selected and the new selected).
//
// The eval counts below prove it. Each createEffect inside the row captures
// a subscription to the selection check for that row. With the naive approach
// every count increments on every click. With createSelector only 2 counts
// increment per click (the row that gained selection + the row that lost it).

const TEAMS = ['Lakers', 'Celtics', 'Warriors', 'Heat', 'Bucks', 'Suns', 'Nuggets', 'Mavs']

export function SelectorDemo() {
  // Column A: naive equality check
  const [selA, setSelA] = createSignal(null)
  // Column B: createSelector
  const [selB, setSelB] = createSignal(null)
  const isSelected = createSelector(selB)

  const [naiveCounts, setNaiveCounts] = createStore(
    Object.fromEntries(TEAMS.map(t => [t, 0]))
  )
  const [selectorCounts, setSelectorCounts] = createStore(
    Object.fromEntries(TEAMS.map(t => [t, 0]))
  )

  return (
    <div class={styles.root}>
      <header class={styles.header}>
        <span class={styles.label}>Selector</span>
        <span class={styles.sublabel}>createSelector</span>
      </header>
      <p class={styles.note}>
        Eval count increments each time a row's selection check re-evaluates.
        Naive: all 8 increment per click. createSelector: exactly 2 per click.
      </p>
      <div class={styles.columns}>
        <div class={styles.column}>
          <div class={styles.colLabel}>naive: selected() === id</div>
          <For each={TEAMS}>
            {(team) => {
              createEffect(() => {
                // Subscribes to selA() — fires for ALL rows on every click
                const _ = selA() === team
                setNaiveCounts(team, c => c + 1)
              })
              return (
                <button
                  class={styles.row}
                  data-active={selA() === team}
                  onClick={() => setSelA(team)}
                >
                  <span class={styles.teamName}>{team}</span>
                  <span class={styles.evalCount}>{naiveCounts[team]}</span>
                </button>
              )
            }}
          </For>
        </div>
        <div class={styles.column}>
          <div class={styles.colLabel}>createSelector</div>
          <For each={TEAMS}>
            {(team) => {
              createEffect(() => {
                // isSelected(team) fires ONLY when this team's status changes
                const _ = isSelected(team)
                setSelectorCounts(team, c => c + 1)
              })
              return (
                <button
                  class={styles.row}
                  data-active={isSelected(team)}
                  onClick={() => setSelB(team)}
                >
                  <span class={styles.teamName}>{team}</span>
                  <span class={styles.evalCount}>{selectorCounts[team]}</span>
                </button>
              )
            }}
          </For>
        </div>
      </div>
    </div>
  )
}
