import { For, Show, createMemo } from 'solid-js'
import { outcomes } from '../../data/outcomes'
import { parseGameId } from '../../data/gameId'
import styles from './PickStreak.module.css'

// Personal performance narrative over data that already exists (outcomes()),
// zero new fetch -- same "no fetch" posture as History. What's genuinely new:
// History's MultiDayRecord shows per-day W/L/P totals; nothing anywhere
// computes a CURRENT streak (how many in a row, right now) or breaks that
// down per sport for a "you're 5-0 on NFL picks this week" narrative line.

// parseGameId now lives in src/data/gameId.js. The inline version here
// required the id to start with a date, which is true of the drama
// leaderboard's scheme and false of all three archive schemes -- so every
// outcome marked on an archive-keyed game was silently dropped from both the
// streak and the week. See scripts/check-gameid-parse.mjs for the real ids.

function daysAgo(dateStr) {
  const d = new Date(dateStr + 'T00:00:00Z')
  const today = new Date(new Date().toISOString().split('T')[0] + 'T00:00:00Z')
  return Math.round((today - d) / 86400000)
}

// Current streak: every W/L outcome (pushes excluded -- a push doesn't
// break or extend a streak), sorted most-recent-date-first. Same-date
// picks have no real intra-day ordering signal in this data, so ties are
// broken by gameId string -- documented, not claimed to be exact game
// order within a day.
function useCurrentStreak() {
  return createMemo(() => {
    const entries = Object.entries(outcomes())
      .map(([gameId, result]) => ({ gameId, result, ...parseGameId(gameId) }))
      .filter(e => e.date && (e.result === 'W' || e.result === 'L'))
      .sort((a, b) => b.date.localeCompare(a.date) || b.gameId.localeCompare(a.gameId))

    if (entries.length === 0) return { count: 0, kind: null }
    const kind = entries[0].result
    let count = 0
    for (const e of entries) {
      if (e.result !== kind) break
      count++
    }
    return { count, kind }
  })
}

// This week: last 7 days including today, grouped by sport parsed from
// the gameId, one narrative line per sport with at least one mark.
function useThisWeek() {
  return createMemo(() => {
    const bySport = {}
    for (const [gameId, result] of Object.entries(outcomes())) {
      const { date, sport } = parseGameId(gameId)
      if (!date || !sport) continue
      if (daysAgo(date) > 6 || daysAgo(date) < 0) continue
      if (!bySport[sport]) bySport[sport] = { w: 0, l: 0, p: 0 }
      if (result === 'W') bySport[sport].w++
      else if (result === 'L') bySport[sport].l++
      else if (result === 'P') bySport[sport].p++
    }
    return Object.entries(bySport)
      .map(([sport, rec]) => ({ sport, ...rec, total: rec.w + rec.l + rec.p }))
      .sort((a, b) => b.total - a.total)
  })
}

function StreakBanner(props) {
  const s = () => props.streak
  return (
    <Show
      when={s().count > 0}
      fallback={<p class={styles.empty}>No streak yet — mark some outcomes in Ambient to start one.</p>}
    >
      <div class={`${styles.banner} ${s().kind === 'W' ? styles.hot : styles.cold}`}>
        <span class={styles.bannerIcon}>{s().kind === 'W' ? '🔥' : '❄️'}</span>
        <span class={styles.bannerText}>
          you're <strong>{s().kind === 'W' ? `${s().count}-0` : `0-${s().count}`}</strong> in a row
          {s().kind === 'L' ? ' (cold streak)' : ''}
        </span>
      </div>
    </Show>
  )
}

function WeekRow(props) {
  const r = () => props.rec
  return (
    <div class={styles.weekRow}>
      <span class={styles.sportTag}>{r().sport}</span>
      <span class={styles.narrative}>
        you're <strong>{r().w}-{r().l}</strong>{r().p ? `-${r().p}` : ''} on {r().sport} picks this week
      </span>
    </div>
  )
}

export function PickStreak() {
  const streak = useCurrentStreak()
  const week = useThisWeek()

  return (
    <div class={styles.root}>
      <header class={styles.header}>
        <span class={styles.label}>Pick Streak</span>
        <span class={styles.sublabel}>your own record, no fetch</span>
      </header>
      <StreakBanner streak={streak} />
      <Show when={week().length}>
        <div class={styles.weekList}>
          <For each={week()}>{rec => <WeekRow rec={rec} />}</For>
        </div>
      </Show>
    </div>
  )
}
