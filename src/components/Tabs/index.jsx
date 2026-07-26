import { For, Show } from 'solid-js'
import styles from './Tabs.module.css'

// Shared tab primitive, extracted from Seasons' local copy.
//
// Why a shared component rather than copying the pattern into PickEm and
// DayComparison: this repo has already been bitten twice today by
// parallel copies drifting (App.artifact.jsx missing an ErrorBoundary and
// then five whole components; NON_MATCHUP_SPORTS diverging between
// PickEm and DeskCard). Three tab bars styled and behaved independently
// would be the same failure waiting to happen, and it's the exact case
// the repo's own shared.module.css chip primitive exists to prevent.
//
// The SolidJS-specific detail worth stating: `active` is passed as an
// ACCESSOR (a function), not a value. Passing `active={activeSignal()}`
// would read the signal in the parent's tracking scope and hand down a
// dead snapshot -- the tab bar would render once and never restyle on
// change. Passing the accessor itself defers the read into this
// component's own JSX, so only the button's class expression
// re-evaluates when it changes, not the whole bar. That's the same
// props-are-getters discipline the rest of this repo follows.
//
// `tabs` may be a plain array OR an accessor: <For> unwraps a function
// source, so both work. Seasons passes an accessor (its tab list is
// derived from live standings); PickEm/DayComparison pass static arrays.
export function Tabs(props) {
  return (
    <div class={styles.tabBar} role="tablist">
      <For each={typeof props.tabs === 'function' ? props.tabs() : props.tabs}>
        {tab => (
          <button
            class={`${styles.tab} ${props.active() === tab.key ? styles.tabActive : ''}`}
            role="tab"
            aria-selected={props.active() === tab.key}
            onClick={() => props.setActive(tab.key)}
          >
            {tab.label}
            <Show when={tab.count !== undefined}>
              <span class={styles.tabCount}>{tab.count}</span>
            </Show>
          </button>
        )}
      </For>
    </div>
  )
}
