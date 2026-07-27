import { For, Show, createMemo } from 'solid-js'
import { dramaLeaderboard, dramaSport, setDramaSport, refetchDramaLeaderboard } from '../../data/relay'
import { Tabs } from '../Tabs'
import styles from './DramaLeaderboard.module.css'

const SPORT_TABS = [
  { key: 'MLB', label: 'MLB' },
  { key: 'MLS', label: 'MLS' },
]

// Real, live endpoint confirmed via a direct probe 2026-07-27: GET
// /archive/drama/leaderboard?sport=X -> {ok, sport, season, limit, games[]}
// where each game carries a real drama_peak (0-100ish) and a drama_arc --
// a JSON-STRING of per-play drama scores across the whole game, not a real
// array. Ranked by drama_peak descending; already sorted by the relay, but
// sorted again here defensively rather than assumed.
//
// Distinct from JournalismBrief/QualityReport's editorial-quality signal --
// this is GAME drama (how exciting the game itself was), not prose quality.
function parseArc(arcStr) {
  try {
    const arc = JSON.parse(arcStr)
    return Array.isArray(arc) ? arc : []
  } catch {
    return []
  }
}

function Sparkline(props) {
  const points = createMemo(() => {
    const arc = props.arc
    if (!arc.length) return ''
    const max = Math.max(...arc, 1)
    const step = 100 / Math.max(arc.length - 1, 1)
    return arc.map((v, i) => `${(i * step).toFixed(1)},${(100 - (v / max) * 100).toFixed(1)}`).join(' ')
  })
  return (
    <Show when={points()}>
      <svg class={styles.sparkline} viewBox="0 0 100 100" preserveAspectRatio="none">
        <polyline points={points()} fill="none" stroke="currentColor" stroke-width="6" />
      </svg>
    </Show>
  )
}

function GameRow(props) {
  const g = () => props.game
  return (
    <li class={styles.row}>
      <span class={styles.rank}>{props.rank}</span>
      <div class={styles.matchupBlock}>
        <span class={styles.matchup}>{g().away} @ {g().home}</span>
        <span class={styles.score}>{g().away_score}–{g().home_score}</span>
      </div>
      <div class={styles.arcBlock}>
        <Sparkline arc={parseArc(g().drama_arc)} />
      </div>
      <span class={styles.peak}>{g().drama_peak}</span>
    </li>
  )
}

export function DramaLeaderboard() {
  const data = () => (dramaLeaderboard.error ? undefined : dramaLeaderboard())

  const rankedGames = createMemo(() => {
    const d = data()
    if (!d?.games) return []
    return [...d.games].sort((a, b) => b.drama_peak - a.drama_peak)
  })

  return (
    <div class={styles.root}>
      <header class={styles.header}>
        <span class={styles.label}>Most Dramatic Games</span>
        <button class={styles.refreshBtn} onClick={refetchDramaLeaderboard} aria-label="refresh drama leaderboard">↻</button>
      </header>
      <Tabs id="drama-leaderboard-sport" tabs={SPORT_TABS} active={dramaSport} setActive={setDramaSport} />
      <Show when={dramaLeaderboard.error}>
        <p class={styles.error}>{String(dramaLeaderboard.error)}</p>
      </Show>
      <Show when={!dramaLeaderboard.error}>
        <Show when={data()} fallback={<p class={styles.loading}>Loading…</p>}>
          <Show when={rankedGames().length} fallback={<p class={styles.empty}>No games found.</p>}>
            <ul class={styles.rows}>
              <For each={rankedGames()}>
                {(g, i) => <GameRow game={g} rank={i() + 1} />}
              </For>
            </ul>
          </Show>
        </Show>
      </Show>
    </div>
  )
}
