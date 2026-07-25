import { createContext, useContext, createSignal, For, Show } from 'solid-js'
import styles from './ContextDemo.module.css'

// createContext + useContext: shared state through a component tree without
// prop drilling or module-level stores.
//
// The critical structural difference from a module-level store:
//   module store — singleton, lives for the entire app lifetime, every
//     consumer reads the same value
//   context — created inside a Provider component instance; each Provider
//     owns its own reactive state; that state is destroyed when the Provider
//     unmounts; multiple independent Provider instances produce independent,
//     isolated state
//
// The two Scopes below share the same SportProvider + SportPicker + ActiveBadge
// components but produce completely independent filter state. You cannot do this
// with a single module-level signal — the whole point of context is per-subtree
// ownership.

const SPORTS = ['all', 'nba', 'nfl', 'mlb', 'nhl']

// createContext takes the default value used when no Provider is found above
// in the tree. Default is [getter, setter] matching createSignal shape.
const SportContext = createContext([() => 'all', () => {}])

function SportProvider(props) {
  const [sport, setSport] = createSignal('all')
  return (
    <SportContext.Provider value={[sport, setSport]}>
      {props.children}
    </SportContext.Provider>
  )
}

function useSport() {
  return useContext(SportContext)
}

// Three levels deep — reads context without a single prop passed to it
function ActiveBadge() {
  const [sport] = useSport()
  return <span class={styles.badge}>{sport()}</span>
}

function FilterDisplay() {
  const [sport] = useSport()
  return (
    <div class={styles.filterDisplay}>
      <span class={styles.filterKey}>active</span>
      <ActiveBadge />
      <Show when={sport() !== 'all'}>
        <span class={styles.filterNote}>— {sport()} only</span>
      </Show>
    </div>
  )
}

function SportPicker() {
  const [sport, setSport] = useSport()
  return (
    <div class={styles.pickerRow}>
      <For each={SPORTS}>
        {(s) => (
          <button
            class={styles.filterBtn}
            data-active={sport() === s}
            onClick={() => setSport(s)}
          >
            {s}
          </button>
        )}
      </For>
    </div>
  )
}

// Each Scope renders its own SportProvider — fully isolated state
function Scope(props) {
  return (
    <SportProvider>
      <div class={styles.scope}>
        <span class={styles.scopeLabel}>{props.label}</span>
        <SportPicker />
        <FilterDisplay />
      </div>
    </SportProvider>
  )
}

export function ContextDemo() {
  return (
    <div class={styles.root}>
      <header class={styles.header}>
        <span class={styles.label}>Context</span>
        <span class={styles.sublabel}>createContext + useContext</span>
      </header>
      <p class={styles.note}>
        Two scopes share the same component tree but no reactive state.
        ActiveBadge reads context three levels deep with zero props passed down.
      </p>
      <div class={styles.scopes}>
        <Scope label="scope A" />
        <Scope label="scope B" />
      </div>
    </div>
  )
}
