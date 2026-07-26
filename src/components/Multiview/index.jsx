import { For, Show, createSignal, createEffect, createSelector, createMemo } from 'solid-js'
import { deskStore } from '../../data/relay'
import styles from './Multiview.module.css'

// Production's gamecard has a "+MULTIVIEW" control: select several games
// into a synchronized watch set. SelectorDemo already proved
// createSelector minimizes row re-renders on a small toy list; this is
// the same mechanism applied to a genuine multi-select feature over the
// REAL slate (however many games are actually on today's card), not a
// single active-row highlight over eight fixed team names.
//
// A claim worth getting exactly right, verified by reading
// node_modules/solid-js/dist/dev.js's actual createSelector source
// rather than trusting the common "O(1) lookup" description of it:
// createSelector's internal computation reruns `fn(key, next) !==
// fn(key, prev)` for EVERY key any row has ever subscribed with —
// `for (const [key, val] of subs.entries())` — on every single source
// change, regardless of whether `fn` is the default `===` or (as here) a
// custom Set-membership predicate. That loop is O(number of distinct
// subscribed keys), not O(1). What createSelector actually minimizes is
// the OUTPUT: only keys whose predicate result actually flipped get
// marked stale, so only THOSE rows' effects re-fire — the naive column
// below instead subscribes every row directly to the whole selection
// signal, so literally every row's effect re-fires on every toggle,
// regardless of whether that row's own membership changed. The fire
// counters make that output difference a real number, not an assumption
// about an algorithm this repo had never actually read the source of.

function allGames() {
  return [...(deskStore.games?.regular ?? []), ...(deskStore.games?.postseason ?? [])]
}

function gameStatus(g) {
  if (g.home_score === null) return 'pre'
  if (g.finalized_at) return g.went_to_ot ? 'final_ot' : 'final'
  return 'live'
}

function useToggleSet() {
  const [set, setSet] = createSignal(new Set())
  function toggle(id) {
    setSet(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }
  return [set, toggle]
}

function RowView(props) {
  return (
    <button
      type="button"
      class={styles.row}
      data-selected={props.selected}
      aria-pressed={props.selected}
      onClick={props.onToggle}
    >
      <span class={`${styles.dot} ${styles[gameStatus(props.game)]}`} />
      <span class={styles.matchup}>{props.game.away} @ {props.game.home}</span>
      <span class={styles.fireCount} title="this row's own effect fire count">f{props.fireCount}</span>
    </button>
  )
}

// Subscribes directly to the whole selection signal -- every row's
// effect depends on `set()` itself, so every row re-fires whenever ANY
// row's membership changes, not just its own. `props.bump` increments
// the column-level total directly from inside each row's own effect --
// the only way to get a REAL aggregate fire count rather than one
// inferred from click count (which undercounts naive: one click there
// fires every row, not one).
function NaiveRow(props) {
  const [fireCount, setFireCount] = createSignal(0)
  const selected = () => props.set().has(props.game.id)
  createEffect(() => { selected(); setFireCount(c => c + 1); props.bump() })
  return <RowView game={props.game} selected={selected()} fireCount={fireCount()} onToggle={() => props.onToggle(props.game.id)} />
}

// Subscribes via the createSelector-produced accessor instead -- only
// re-fires when THIS row's own predicate result actually flips.
function SelectorRow(props) {
  const [fireCount, setFireCount] = createSignal(0)
  createEffect(() => { props.isSelected(props.game.id); setFireCount(c => c + 1); props.bump() })
  return <RowView game={props.game} selected={props.isSelected(props.game.id)} fireCount={fireCount()} onToggle={() => props.onToggle(props.game.id)} />
}

function ScoreLine(props) {
  const g = () => props.game
  const status = () => gameStatus(g())
  return (
    <div class={styles.stripRow}>
      <span class={`${styles.dot} ${styles[status()]}`} />
      <span class={styles.stripMatchup}>{g().away} @ {g().home}</span>
      <span class={styles.stripScore}>
        {g().home_score != null ? `${g().away_score}–${g().home_score}` : '—'}
      </span>
    </div>
  )
}

export function Multiview() {
  const games = createMemo(allGames)

  const [naiveSet, toggleNaive] = useToggleSet()
  const [naiveTotal, setNaiveTotal] = createSignal(0)

  const [selectorSet, toggleSelector] = useToggleSet()
  const [selectorTotal, setSelectorTotal] = createSignal(0)
  // Custom equals: the default form compares a single value to `source()`
  // by reference; multi-select needs "is this id currently a MEMBER of
  // the set" instead of "is this id THE selected value."
  const isSelected = createSelector(selectorSet, (id, set) => set.has(id))

  const multiviewGames = createMemo(() => games().filter(g => selectorSet().has(g.id)))

  return (
    <div class={styles.root}>
      <header class={styles.header}>
        <span class={styles.label}>Multiview</span>
        <span class={styles.sublabel}>createSelector multi-select, real slate scale</span>
      </header>
      <p class={styles.note}>
        Same real games, two independent selection sets. Naive subscribes every row to the whole
        selection signal; selector subscribes each row only to its own membership. Click either
        column — the fire counts (f#) show exactly what changes.
      </p>
      <div class={styles.columns}>
        <div class={styles.column}>
          <div class={styles.columnLabel}>naive — total row-fires: {naiveTotal()}</div>
          <div class={styles.rowList}>
            <For each={games()}>
              {g => <NaiveRow game={g} set={naiveSet} onToggle={toggleNaive} bump={() => setNaiveTotal(t => t + 1)} />}
            </For>
          </div>
        </div>
        <div class={styles.column}>
          <div class={styles.columnLabel}>selector — total row-fires: {selectorTotal()}</div>
          <div class={styles.rowList}>
            <For each={games()}>
              {g => <SelectorRow game={g} isSelected={isSelected} onToggle={toggleSelector} bump={() => setSelectorTotal(t => t + 1)} />}
            </For>
          </div>
        </div>
      </div>

      <div class={styles.stripLabel}>
        multiview strip — {multiviewGames().length} game{multiviewGames().length === 1 ? '' : 's'} selected (selector column)
      </div>
      <Show when={multiviewGames().length} fallback={<p class={styles.empty}>Select games in the selector column above to build a multiview.</p>}>
        <div class={styles.strip}>
          <For each={multiviewGames()}>{g => <ScoreLine game={g} />}</For>
        </div>
      </Show>
    </div>
  )
}
