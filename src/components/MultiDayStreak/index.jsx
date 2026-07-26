import { For, Show, createMemo } from 'solid-js'
import { createDayContext } from '../../data/relay'
import styles from './MultiDayStreak.module.css'

// NOT record_streak_board (the relay's own server-computed streak,
// already rendered in AmbientPanel's StreakBoard) -- this is a
// separately, client-computed streak, built by fetching N independent
// days via createDayContext and deriving a win/loss sequence for one
// team across them. Real test: DayComparison already proved 2 concurrent
// createResource contexts work; this scales to 5 and asks whether that
// stays ergonomic or starts feeling like the wrong pattern at N>2.

function dayOffset(dateStr, offset) {
  const d = new Date(dateStr + 'T00:00:00Z')
  d.setUTCDate(d.getUTCDate() + offset)
  return d.toISOString().split('T')[0]
}

const DAYS_BACK = 5

export function MultiDayStreak(props) {
  // props.baseDate is a plain string, read once at creation -- each
  // context below is genuinely independent, not re-created on every
  // parent re-render, matching DayComparison's own approach.
  const contexts = Array.from({ length: DAYS_BACK }, (_, i) =>
    createDayContext(dayOffset(props.baseDate, -(DAYS_BACK - 1 - i)))
  )

  const teamName = () => props.team

  // Same posture as StandingRoom/DayComparison: a resource throws when read in
  // error state, and `?.`/`??` only guard the loading case -- checking
  // `.error` before calling the accessor avoids ever invoking it while errored.
  const results = createMemo(() =>
    contexts.map(ctx => {
      if (ctx.data.error) return { date: ctx.date(), result: null }
      const games = [
        ...(ctx.data()?.games?.regular ?? []),
        ...(ctx.data()?.games?.postseason ?? []),
      ]
      const g = games.find(g => g.home === teamName() || g.away === teamName())
      if (!g || g.home_score == null) return { date: ctx.date(), result: null }
      const isHome = g.home === teamName()
      const won = isHome ? g.home_score > g.away_score : g.away_score > g.home_score
      return { date: ctx.date(), result: won ? 'W' : 'L' }
    })
  )

  const allLoaded = createMemo(() => contexts.every(c => !c.data.loading))

  return (
    <div class={styles.root}>
      <span class={styles.teamLabel}>{teamName()}</span>
      <Show when={allLoaded()} fallback={<span class={styles.loading}>loading {DAYS_BACK} days…</span>}>
        <div class={styles.sequence}>
          <For each={results()}>
            {r => (
              <span class={`${styles.pip} ${r.result ? styles['pip_' + r.result] : styles.pip_none}`} title={r.date}>
                {r.result ?? '·'}
              </span>
            )}
          </For>
        </div>
      </Show>
    </div>
  )
}
