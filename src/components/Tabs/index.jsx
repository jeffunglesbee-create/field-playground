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
//
// `id` (optional, defaults to "tabs") namespaces this instance's
// generated element IDs -- needed because this component can be mounted
// several times at once (App's own top-level nav plus, say, Stats' own
// MLB/MLS/World Cup tabs, simultaneously present whenever the Stats tab
// is active) and DOM IDs must be globally unique, not just unique within
// one tab bar. tabId(key)/panelId(key) are exported so a consumer that
// renders its own tabpanel element (App.jsx does; Seasons/PickEm/
// DayComparison/Stats currently don't wire theirs up, pre-existing and
// unrelated to this change) can match `aria-labelledby`/`aria-controls`
// to the exact IDs this component put on its buttons, without duplicating
// the naming scheme.
//
// Roving tabindex (WAI-ARIA APG tabs pattern): only the active tab is a
// normal Tab-key stop; arrow keys move both focus and selection among
// the rest. This became more than a nicety once App.jsx started using
// this as the app's primary navigation instead of an in-card control --
// CodeRabbit correctly flagged the top-level usage as needing it, and
// since the mechanism lives here, every consumer gets it for free.
export function tabId(id, key) { return `${id ?? 'tabs'}-tab-${key}` }
export function panelId(id, key) { return `${id ?? 'tabs'}-panel-${key}` }

export function Tabs(props) {
  const list = () => (typeof props.tabs === 'function' ? props.tabs() : props.tabs)

  function handleKeyDown(e) {
    const nav = { ArrowRight: 1, ArrowLeft: -1 }
    if (!(e.key in nav) && e.key !== 'Home' && e.key !== 'End') return
    e.preventDefault()
    const tabs = list()
    const currentIndex = tabs.findIndex(t => t.key === props.active())
    const nextIndex =
      e.key === 'Home' ? 0 :
      e.key === 'End' ? tabs.length - 1 :
      (currentIndex + nav[e.key] + tabs.length) % tabs.length
    const nextKey = tabs[nextIndex].key
    props.setActive(nextKey)
    document.getElementById(tabId(props.id, nextKey))?.focus()
  }

  return (
    <div class={styles.tabBar} role="tablist" onKeyDown={handleKeyDown}>
      <For each={list()}>
        {tab => (
          <button
            id={tabId(props.id, tab.key)}
            class={`${styles.tab} ${props.active() === tab.key ? styles.tabActive : ''}`}
            role="tab"
            aria-selected={props.active() === tab.key}
            aria-controls={panelId(props.id, tab.key)}
            tabIndex={props.active() === tab.key ? 0 : -1}
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
