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
import { WpSourceBadge } from '../WpSourceBadge'
import styles from './LiveWpTicker.module.css'

// Live WP Ticker (Proposal #2) + WP Source Badge (Proposal #3), gated
// by the WP Estimator Validation Lab. The estimator was validated
// against real Savant ground truth on MLB ONLY -- this ticker stays
// MLB-only for the same reason, rather than silently extending an
// unvalidated model to NBA/MLS/EPL.
//
// DIRECT fetch, not routed through field-relay-nba: statsapi.mlb.com
// AND baseballsavant.mlb.com both confirmed live (scripts/probe-wp-
// ticker-cors.mjs, CI run 2026-07-31) to return Access-Control-Allow-
// Origin: * -- checked, not assumed, before building this the same way
// WeatherPoll's Open-Meteo call was.
//
// Proposal #3's whole point: don't just LABEL the estimate
// "Estimated" and call it a source badge -- show it NEXT TO the real
// number so the label means something a user can check themselves,
// live, not just take on faith from a validation doc. Savant's own
// gameWpa array (same field path as the validation lab's ground
// truth: scoreboard.stats.wpa.gameWpa, homeTeamWinProbability /100)
// is fetched independently and badged SAVANT; the client-side model
// is fetched/computed independently and badged ESTIMATED. Neither
// backstops the other -- if one fails, it says so, it does not borrow
// the other's number.
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

// Same endpoint, same field, same /100 scale fix as the validation
// lab's own fetchSavantWpa -- the real ground truth this whole feature
// is judged against, read live instead of from a historical sample.
async function fetchSavantWp(gamePk) {
  const res = await fetch(`https://baseballsavant.mlb.com/gf?game_pk=${gamePk}`)
  if (!res.ok) throw new Error('Savant HTTP ' + res.status)
  const data = await res.json()
  const arr = data?.scoreboard?.stats?.wpa?.gameWpa
  if (!Array.isArray(arr) || !arr.length) return null
  const raw = Number(arr[arr.length - 1]?.homeTeamWinProbability)
  if (!Number.isFinite(raw)) return null
  return raw / 100
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
      setRows(g.id, prev => ({ ...prev, home: g.home, away: g.away, loading: !prev?.estimatedWp && prev?.savantWp == null, error: null }))
      try {
        const pk = await resolveGamePk(currentDate(), g.home, g.away)
        if (!pk) { setRows(g.id, r => ({ ...r, loading: false, error: 'no real gamePk resolved' })); return }

        // Two independent sources, two independent failure modes --
        // one failing must not hide or fake the other.
        const [stateResult, savantResult] = await Promise.allSettled([
          fetchLiveState(pk),
          fetchSavantWp(pk),
        ])
        const state = stateResult.status === 'fulfilled' ? stateResult.value : null
        const stateErr = stateResult.status === 'rejected'
          ? String(stateResult.reason?.message ?? stateResult.reason).slice(0, 100)
          : (state ? null : 'live feed has no play data yet')
        const savantWp = savantResult.status === 'fulfilled' ? savantResult.value : null
        const savantErr = savantResult.status === 'rejected'
          ? String(savantResult.reason?.message ?? savantResult.reason).slice(0, 100)
          : (savantWp == null ? 'no Savant reading yet' : null)

        if (!state && savantWp == null) {
          setRows(g.id, r => ({ ...r, loading: false, error: stateErr || savantErr || 'no data available' }))
          return
        }

        const estimatedWp = state != null
          ? estimateWinProb({ scoreDiff: state.homeScore - state.awayScore, periodProgress: periodProgress(state.inning, state.halfBottom) })
          : null

        setRows(g.id, {
          home: g.home, away: g.away, loading: false, error: null,
          homeScore: state?.homeScore, awayScore: state?.awayScore,
          inning: state?.inning, halfBottom: state?.halfBottom,
          estimatedWp, estimatedError: estimatedWp == null ? stateErr : null,
          savantWp, savantError: savantWp == null ? savantErr : null,
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
        Two independent live reads, badged by source, never blended: Baseball Savant's real number
        and a client-side <code>estimateWinProb(scoreDiff, periodProgress)</code>, validated against
        real held-out Savant data at MAE {WP_ESTIMATOR_MAE_REGULATION.toFixed(3)} in regulation
        innings. The estimate is the proposed fallback for NBA/MLS/EPL, where no win-probability
        source exists at all — this is where it's checked against a real one, live.
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
              <Show when={!row.loading && !row.error && (row.estimatedWp != null || row.savantWp != null)}>
                <div class={styles.state}>
                  <span class={styles.score}>
                    {row.homeScore != null ? `${row.awayScore}–${row.homeScore}` : 'score unavailable'}
                  </span>
                  <Show when={row.inning != null}>
                    <span class={styles.inningNote}>{row.halfBottom ? 'B' : 'T'}{row.inning}</span>
                  </Show>
                </div>

                <div class={styles.sourceRow}>
                  <WpSourceBadge source="savant" />
                  <Show
                    when={row.savantWp != null}
                    fallback={<span class={styles.unavailable}>unavailable{row.savantError ? `: ${row.savantError}` : ''}</span>}
                  >
                    <div class={styles.wpBar} title={`${row.home} win probability (Savant, real): ${(row.savantWp * 100).toFixed(1)}%`}>
                      <div class={`${styles.wpFill} ${styles.savantFill}`} style={{ width: `${(row.savantWp * 100).toFixed(1)}%` }} />
                    </div>
                    <span class={styles.wpValue}>{(row.savantWp * 100).toFixed(0)}%</span>
                  </Show>
                </div>

                <div class={styles.sourceRow}>
                  <WpSourceBadge source="estimated" />
                  <Show
                    when={row.estimatedWp != null}
                    fallback={<span class={styles.unavailable}>unavailable{row.estimatedError ? `: ${row.estimatedError}` : ''}</span>}
                  >
                    <div class={styles.wpBar} title={`${row.home} win probability (client-side estimate): ${(row.estimatedWp * 100).toFixed(1)}%`}>
                      <div class={styles.wpFill} style={{ width: `${(row.estimatedWp * 100).toFixed(1)}%` }} />
                    </div>
                    <span class={styles.wpValue}>{(row.estimatedWp * 100).toFixed(0)}%</span>
                  </Show>
                </div>

                <Show when={row.savantWp != null && row.estimatedWp != null}>
                  <span class={styles.delta}>
                    Δ {(Math.abs(row.savantWp - row.estimatedWp) * 100).toFixed(1)}pp live vs Savant
                  </span>
                </Show>

                <Show when={row.inning != null && isExtraInnings(row.inning)}>
                  <span class={styles.extraInningsBadge} title={`Estimator validated MAE jumps to ${WP_ESTIMATOR_MAE_EXTRA_INNINGS.toFixed(3)} in extra innings (n=7 held-out test points), vs ${WP_ESTIMATOR_MAE_REGULATION.toFixed(3)} in regulation -- read the ESTIMATED number with real caution here; SAVANT's real number is unaffected.`}>
                    ⚠ extra innings — estimate less reliable
                  </span>
                </Show>
              </Show>
            </div>
          )}
        </For>
      </div>
    </div>
  )
}
