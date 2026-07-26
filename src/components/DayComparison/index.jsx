import { For, Show, createMemo, createSignal } from 'solid-js'
import { currentDate, createDayContext } from '../../data/relay'
import { Tabs } from '../Tabs'
import styles from './DayComparison.module.css'

function gameStatus(g) {
  if (g.home_score === null) return 'pre'
  if (g.finalized_at) return g.went_to_ot ? 'final_ot' : 'final'
  return 'live'
}

function yesterdayOf(dateStr) {
  const d = new Date(dateStr + 'T00:00:00Z')
  d.setUTCDate(d.getUTCDate() - 1)
  return d.toISOString().split('T')[0]
}

function DayColumn(props) {
  // Same posture as StandingRoom: a resource throws when read in error state, and
  // `?.`/`??` only guard the loading case, not the error case -- checking
  // `.error` before calling the accessor avoids ever invoking it while errored.
  const games = createMemo(() => {
    if (props.ctx.data.error) return []
    return [
      ...(props.ctx.data()?.games?.regular ?? []),
      ...(props.ctx.data()?.games?.postseason ?? []),
    ]
  })

  return (
    <div class={styles.column}>
      <div class={styles.columnHeader}>{props.label}</div>
      <div class={styles.columnDate}>{props.ctx.date()}</div>
      <Show when={props.ctx.data.loading}>
        <p class={styles.loading}>Loading…</p>
      </Show>
      <Show when={props.ctx.data.error}>
        <p class={styles.loading}>Unable to load this day.</p>
      </Show>
      <Show when={games().length}>
        <div class={styles.gameList}>
          <For each={games()}>
            {g => (
              <div class={styles.row}>
                <span class={`${styles.dot} ${styles[gameStatus(g)]}`} />
                <span class={styles.matchup}>{g.away} @ {g.home}</span>
                <span class={styles.score}>
                  {g.home_score != null ? `${g.away_score}–${g.home_score}` : '—'}
                </span>
              </div>
            )}
          </For>
        </div>
      </Show>
    </div>
  )
}

// Two INDEPENDENT createDayContext instances -- neither tied to the
// shared currentDate/date-browser signal used everywhere else. Each
// column fetches and holds its own data entirely on its own; nothing
// here shares state with DeskCard's deskStore or the date browser at
// all. That independence is the actual thing under test: does the
// resource pattern used everywhere else in this repo (assumed
// implicitly singleton) actually support two live instances existing
// side by side without interfering.
export function DayComparison() {
  const today = createDayContext(currentDate())
  const yesterday = createDayContext(yesterdayOf(currentDate()))

  const [view, setView] = createSignal('both')

  // "Both" is kept as a tab rather than replaced by tabs, deliberately.
  // The point of this experiment is two INDEPENDENT resources alive
  // simultaneously -- if tabs only ever mounted one column at a time,
  // the thing under test would no longer be exercised at all. Both
  // contexts are created unconditionally above (outside any <Show>), so
  // they stay alive and keep fetching regardless of which tab is
  // showing; the tabs change what's VISIBLE, not what's running.
  const tabs = [
    { key: 'both', label: 'Both' },
    { key: 'yesterday', label: 'Yesterday' },
    { key: 'today', label: 'Today' },
  ]

  return (
    <div class={styles.root}>
      <header class={styles.header}>
        <span class={styles.label}>Day Comparison</span>
      </header>
      <Tabs tabs={tabs} active={view} setActive={setView} />
      <div class={view() === 'both' ? styles.columns : styles.singleColumn}>
        <Show when={view() === 'both' || view() === 'yesterday'}>
          <DayColumn ctx={yesterday} label="Yesterday" />
        </Show>
        <Show when={view() === 'both' || view() === 'today'}>
          <DayColumn ctx={today} label="Today" />
        </Show>
      </div>
    </div>
  )
}
