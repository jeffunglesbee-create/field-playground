import { For, Show, createMemo, createEffect, onCleanup } from 'solid-js'
import { createStore } from 'solid-js/store'
import { dramaLeaderboard, dramaSport, setDramaSport, refetchDramaLeaderboard } from '../../data/relay'
import { fetchWpMovement } from '../../data/dramaWpMovement'
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

// WP Movement -- round 3's validated richer signal (docs/outbox/chat-
// update-2026-07-30-drama-scoring-round3.md), re-confirmed against
// TODAY'S real leaderboard 2026-08-01 (scripts/probe-drama-leaderboard-
// wp-movement.mjs): the current top-8 "Most Dramatic Games" are ALL
// tied at drama_peak=74 (1/8 distinct) -- real coarseness, not a
// hypothetical -- while total_wp_movement distinguished all 8 (8/8
// distinct, 3.30-7.18) on those exact same games. Shown alongside
// drama_peak, never replacing it -- neither backstops the other, same
// dual-source principle as WpSourceBadge. MLB only: Baseball Savant is
// MLB-specific, this has never been validated for any other sport.
function WpMovementRow(props) {
  return (
    <div class={styles.wpMovementRow}>
      <span class={styles.wpMovementLabel} title="Round 3's validated richer signal: sum of real per-play win-probability swings across the whole game (and separately, just innings 7+). Distinguished all 8 of today's real top-drama-peak ties; drama_peak distinguished none.">
        WP movement
      </span>
      <Show
        when={!props.loading && !props.error && props.movement}
        fallback={
          <span class={styles.wpMovementState}>
            {props.loading ? 'loading…' : props.error ? `unavailable: ${props.error}` : ''}
          </span>
        }
      >
        <span class={styles.wpMovementValue}>
          {props.movement.totalMovement.toFixed(2)}
          <span class={styles.wpMovementSub}> total</span>
        </span>
        <span class={styles.wpMovementValue}>
          {props.movement.lateMovement.toFixed(2)}
          <span class={styles.wpMovementSub}> late (inn 7+)</span>
        </span>
      </Show>
    </div>
  )
}

function GameRow(props) {
  const g = () => props.game
  return (
    <li class={styles.row}>
      <div class={styles.rowMain}>
        <span class={styles.rank}>{props.rank}</span>
        <div class={styles.matchupBlock}>
          <span class={styles.matchup}>{g().away} @ {g().home}</span>
          <span class={styles.score}>{g().away_score}–{g().home_score}</span>
        </div>
        <div class={styles.arcBlock}>
          <Sparkline arc={parseArc(g().drama_arc)} />
        </div>
        <span class={styles.peak} title="drama_peak — the existing production signal, a single max across the whole game">{g().drama_peak}</span>
      </div>
      <Show when={props.wpMovement}>
        <WpMovementRow loading={props.wpMovement.loading} error={props.wpMovement.error} movement={props.wpMovement.data} />
      </Show>
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

  // Keyed by game id -- MLB only, per the module's own documented scope.
  const [wpMovements, setWpMovements] = createStore({})
  let cancelled = false
  onCleanup(() => { cancelled = true })

  createEffect(() => {
    const games = rankedGames()
    if (dramaSport() !== 'MLB') return
    for (const g of games) {
      if (wpMovements[g.id]) continue // already loaded/loading -- don't re-fetch on every leaderboard refresh
      setWpMovements(g.id, { loading: true, error: null, data: null })
      fetchWpMovement(g.date, g.home, g.away)
        .then(result => {
          if (cancelled) return
          if (!result) { setWpMovements(g.id, { loading: false, error: 'no real gamePk/WP data resolved', data: null }); return }
          setWpMovements(g.id, { loading: false, error: null, data: result })
        })
        .catch(e => {
          if (cancelled) return
          setWpMovements(g.id, { loading: false, error: String(e?.message ?? e).slice(0, 100), data: null })
        })
    }
  })

  return (
    <div class={styles.root}>
      <header class={styles.header}>
        <span class={styles.label}>Most Dramatic Games</span>
        <button class={styles.refreshBtn} onClick={refetchDramaLeaderboard} aria-label="refresh drama leaderboard">↻</button>
      </header>
      <Tabs id="drama-leaderboard-sport" tabs={SPORT_TABS} active={dramaSport} setActive={setDramaSport} />
      <Show when={dramaSport() === 'MLS'}>
        <p class={styles.note}>WP movement is MLB-only — Baseball Savant, the real win-probability source, doesn't cover MLS.</p>
      </Show>
      <Show when={dramaLeaderboard.error}>
        <p class={styles.error}>{String(dramaLeaderboard.error)}</p>
      </Show>
      <Show when={!dramaLeaderboard.error}>
        <Show when={data()} fallback={<p class={styles.loading}>Loading…</p>}>
          <Show when={rankedGames().length} fallback={<p class={styles.empty}>No games found.</p>}>
            <ul class={styles.rows}>
              <For each={rankedGames()}>
                {(g, i) => <GameRow game={g} rank={i() + 1} wpMovement={dramaSport() === 'MLB' ? wpMovements[g.id] : null} />}
              </For>
            </ul>
          </Show>
        </Show>
      </Show>
    </div>
  )
}
