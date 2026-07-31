import { For, Show, createSignal, createMemo, onMount, onCleanup } from 'solid-js'
import { createStore, reconcile } from 'solid-js/store'
import { deskStore, currentDate } from '../../data/relay'
import {
  estimateWinProb,
  periodProgress,
  isExtraInnings,
  WP_ESTIMATOR_MAE_REGULATION,
  WP_ESTIMATOR_MAE_EXTRA_INNINGS,
} from '../../data/wpEstimator'
import styles from './LiveWpTicker.module.css'

// Live WP Ticker (Proposal #2, gated by the WP Estimator Validation
// Lab). The estimator was validated against real Savant ground truth
// on MLB ONLY -- this ticker stays MLB-only for the same reason,
// rather than silently extending an unvalidated model to NBA/MLS/EPL.
//
// DIRECT fetch, not routed through field-relay-nba: statsapi.mlb.com
// confirmed live (scripts/probe-wp-ticker-cors.mjs, CI run
// 2026-07-31) to return Access-Control-Allow-Origin: * on both the
// schedule and live-feed endpoints -- checked, not assumed, before
// building this the same way WeatherPoll's Open-Meteo call was.
//
// The field-mapping (allPlays[last].result.homeScore/awayScore,
// .about.inning/halfInning) is the EXACT path already proven across
// 28/28 real games in the validation lab's own CI run -- not a new
// guess at MLB Stats API's shape.
const TICKER_POLL_MS = 20000

// gamePk never changes mid-game -- resolving it by team-name+date
// match on every poll would be wasteful, so it's cached once per
// (date, home, away) key for the life of the page.
const gamePkCache = new Map()

function gameStatus(g) {
  if (g.home_score === null) return 'pre'
  if (g.finalized_at) return 'final'
  return 'live'
}

async function resolveGamePk(date, home, away) {
  const key = date + '|' + home + '|' + away
  if (gamePkCache.has(key)) return gamePkCache.get(key)
  const res = await fetch(`https://statsapi.mlb.com/api/v1/schedule?sportId=1&date=${date}`)
  if (!res.ok) throw new Error('schedule HTTP ' + res.status)
  const data = await res.json()
  const games = data?.dates?.[0]?.games ?? []
  const norm = s => (s || '').toLowerCase().replace(/[^a-z]/g, '')
  const h = norm(home), a = norm(away)
  const match = games.find(g => {
    const gh = norm(g.teams?.home?.team?.name)
    const ga = norm(g.teams?.away?.team?.name)
    return (gh.includes(h) || h.includes(gh)) && (ga.includes(a) || a.includes(ga))
  })
  const pk = match?.gamePk ?? null
  gamePkCache.set(key, pk)
  return pk
}

async function fetchLiveState(gamePk) {
  const res = await fetch(`https://statsapi.mlb.com/api/v1.1/game/${gamePk}/feed/live`)
  if (!res.ok) throw new Error('live feed HTTP ' + res.status)
  const data = await res.json()
  const plays = data?.liveData?.plays?.allPlays
  if (!Array.isArray(plays) || !plays.length) return null
  const last = plays[plays.length - 1]
  const homeScore = last?.result?.homeScore
  const awayScore = last?.result?.awayScore
  const inning = last?.about?.inning
  const halfBottom = last?.about?.halfInning === 'bottom'
  if (homeScore == null || awayScore == null || inning == null) return null
  return { homeScore, awayScore, inning, halfBottom }
}

export function LiveWpTicker() {
  const [rows, setRows] = createStore({})
  const [pollCount, setPollCount] = createSignal(0)

  const liveMlbGames = createMemo(() => {
    const all = [...(deskStore.games?.regular ?? []), ...(deskStore.games?.postseason ?? [])]
    return all.filter(g => g.sport === 'MLB' && gameStatus(g) === 'live')
  })

  async function pollOnce() {
    const games = liveMlbGames()
    setPollCount(c => c + 1)
    await Promise.allSettled(games.map(async g => {
      setRows(g.id, prev => ({ ...prev, home: g.home, away: g.away, loading: !prev?.wp, error: null }))
      try {
        const pk = await resolveGamePk(currentDate(), g.home, g.away)
        if (!pk) { setRows(g.id, r => ({ ...r, loading: false, error: 'no real gamePk resolved' })); return }
        const state = await fetchLiveState(pk)
        if (!state) { setRows(g.id, r => ({ ...r, loading: false, error: 'live feed has no play data yet' })); return }
        const p = periodProgress(state.inning, state.halfBottom)
        const wp = estimateWinProb({ scoreDiff: state.homeScore - state.awayScore, periodProgress: p })
        setRows(g.id, {
          home: g.home, away: g.away, loading: false, error: null,
          homeScore: state.homeScore, awayScore: state.awayScore,
          inning: state.inning, halfBottom: state.halfBottom, wp,
        })
      } catch (e) {
        setRows(g.id, r => ({ ...r, loading: false, error: String(e?.message ?? e).slice(0, 120) }))
      }
    }))
    // Drop rows for games no longer live (final, or postponed off the slate).
    const liveIds = new Set(games.map(g => g.id))
    setRows(reconcile(Object.fromEntries(Object.entries(rows).filter(([id]) => liveIds.has(id)))))
  }

  onMount(() => {
    pollOnce()
    const handle = setInterval(pollOnce, TICKER_POLL_MS)
    onCleanup(() => clearInterval(handle))
  })

  const rowList = createMemo(() => liveMlbGames().map(g => ({ id: g.id, ...rows[g.id] })))

  return (
    <div class={styles.root}>
      <header class={styles.header}>
        <span class={styles.label}>Live WP Ticker</span>
        <span class={styles.sublabel}>
          MLB only, direct-fetched every {TICKER_POLL_MS / 1000}s — polled {pollCount()} time{pollCount() === 1 ? '' : 's'}
        </span>
      </header>
      <p class={styles.note}>
        Client-side <code>estimateWinProb(scoreDiff, periodProgress)</code>, validated against real
        Savant win probability (MAE {WP_ESTIMATOR_MAE_REGULATION.toFixed(3)} in regulation innings) —
        the same client-side model proposed as a fallback for NBA/MLS/EPL, where no win-probability
        source exists at all. This is the estimate, not Savant's real number.
      </p>
      <Show when={rowList().length === 0}>
        <p class={styles.empty}>No live MLB games right now.</p>
      </Show>
      <div class={styles.rowList}>
        <For each={rowList()}>
          {row => (
            <div class={styles.row}>
              <div class={styles.matchup}>
                <span class={styles.team}>{row.away}</span>
                <span class={styles.at}>@</span>
                <span class={styles.team}>{row.home}</span>
              </div>
              <Show when={row.loading}>
                <span class={styles.loading}>loading…</span>
              </Show>
              <Show when={row.error}>
                <span class={styles.error}>unable to load: {row.error}</span>
              </Show>
              <Show when={!row.loading && !row.error && row.wp != null}>
                <div class={styles.state}>
                  <span class={styles.score}>{row.awayScore}–{row.homeScore}</span>
                  <span class={styles.inningNote}>
                    {row.halfBottom ? 'B' : 'T'}{row.inning}
                  </span>
                  <div class={styles.wpBar} title={`${row.home} win probability: ${(row.wp * 100).toFixed(1)}%`}>
                    <div class={styles.wpFill} style={{ width: `${(row.wp * 100).toFixed(1)}%` }} />
                  </div>
                  <span class={styles.wpValue}>{(row.wp * 100).toFixed(0)}%</span>
                  <Show when={isExtraInnings(row.inning)}>
                    <span class={styles.extraInningsBadge} title={`Estimator validated MAE jumps to ${WP_ESTIMATOR_MAE_EXTRA_INNINGS.toFixed(3)} in extra innings (n=7 held-out test points), vs ${WP_ESTIMATOR_MAE_REGULATION.toFixed(3)} in regulation -- read this number with real caution.`}>
                      ⚠ extra innings — less reliable
                    </span>
                  </Show>
                </div>
              </Show>
            </div>
          )}
        </For>
      </div>
    </div>
  )
}
