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

// Returns the FULL play map (atBatIndex -> state), not just the last
// play -- needed to join against Savant's array (see joinSamePlay
// below). Previously this only read plays[plays.length - 1], which is
// what made the Δ line below compare two feeds' independently-polled
// "latest" points instead of the same real play.
async function fetchMlbPlays(gamePk) {
  const res = await fetch(`https://statsapi.mlb.com/api/v1.1/game/${gamePk}/feed/live`)
  if (!res.ok) throw new Error('live feed HTTP ' + res.status)
  const data = await res.json()
  const plays = data?.liveData?.plays?.allPlays
  if (!Array.isArray(plays) || !plays.length) return null
  const byAtBatIndex = new Map()
  for (const p of plays) {
    const idx = p?.about?.atBatIndex
    const homeScore = p?.result?.homeScore
    const awayScore = p?.result?.awayScore
    const inning = p?.about?.inning
    const halfBottom = p?.about?.halfInning === 'bottom'
    if (idx == null || homeScore == null || awayScore == null || inning == null) continue
    byAtBatIndex.set(idx, { homeScore, awayScore, inning, halfBottom })
  }
  return byAtBatIndex.size ? byAtBatIndex : null
}

// Same endpoint, same field, same /100 scale fix as the validation
// lab's own fetchSavantWpa -- the real ground truth this whole feature
// is judged against, read live instead of from a historical sample.
// Returns the FULL array (not just the last entry) for the same reason
// as fetchMlbPlays above.
async function fetchSavantWpa(gamePk) {
  const res = await fetch(`https://baseballsavant.mlb.com/gf?game_pk=${gamePk}`)
  if (!res.ok) throw new Error('Savant HTTP ' + res.status)
  const data = await res.json()
  const arr = data?.scoreboard?.stats?.wpa?.gameWpa
  if (!Array.isArray(arr) || !arr.length) return null
  return arr
}

// TIGHTENED RECONCILIATION: fetchLiveState/fetchSavantWp used to each
// independently pick their own feed's last entry -- two independently-
// polled feeds, no guarantee they landed on the same real play (Savant
// can lag or lead the live feed by a play or more). Joined by
// atBatIndex instead, the same key confirmed a 100% reliable join
// across 28 real full games in scripts/probe-wpbonus-fix-resolution.mjs
// -- so the score/inning shown and the Savant WP compared against are
// now guaranteed the exact same real play, not each source's own tail.
// Walks Savant's array backward (most real-time first) looking for the
// newest entry whose atBatIndex the live feed also has a play for.
function joinSamePlay(byAtBatIndex, savantArr) {
  for (let i = savantArr.length - 1; i >= 0; i--) {
    const e = savantArr[i]
    const idx = e?.atBatIndex
    const state = idx != null ? byAtBatIndex.get(idx) : null
    if (!state) continue
    const raw = Number(e?.homeTeamWinProbability)
    if (!Number.isFinite(raw)) continue
    return { ...state, savantWp: raw / 100, atBatIndex: idx, playsBehindSavant: savantArr.length - 1 - i }
  }
  return null
}

// Fallback for when a join genuinely isn't possible (one feed down, or
// -- rare, early in a game -- no atBatIndex overlap yet): each source's
// own latest, same as this component's original behavior.
function latestFromMap(byAtBatIndex) {
  if (!byAtBatIndex) return null
  let maxIdx = -Infinity, latest = null
  for (const [idx, state] of byAtBatIndex) {
    if (idx > maxIdx) { maxIdx = idx; latest = state }
  }
  return latest
}

function latestSavantWp(savantArr) {
  if (!savantArr || !savantArr.length) return null
  const raw = Number(savantArr[savantArr.length - 1]?.homeTeamWinProbability)
  return Number.isFinite(raw) ? raw / 100 : null
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
        const [playsResult, wpaResult] = await Promise.allSettled([
          fetchMlbPlays(pk),
          fetchSavantWpa(pk),
        ])
        const byAtBatIndex = playsResult.status === 'fulfilled' ? playsResult.value : null
        const playsErr = playsResult.status === 'rejected'
          ? String(playsResult.reason?.message ?? playsResult.reason).slice(0, 100)
          : (byAtBatIndex ? null : 'live feed has no play data yet')
        const savantArr = wpaResult.status === 'fulfilled' ? wpaResult.value : null
        const savantErr = wpaResult.status === 'rejected'
          ? String(wpaResult.reason?.message ?? wpaResult.reason).slice(0, 100)
          : (savantArr ? null : 'no Savant reading yet')

        if (!byAtBatIndex && !savantArr) {
          setRows(g.id, r => ({ ...r, loading: false, error: playsErr || savantErr || 'no data available' }))
          return
        }

        // Prefer the join -- guarantees the score/inning shown and the
        // Savant WP compared against are the exact same real play. Only
        // fall back to each source's own independent latest when a join
        // genuinely isn't possible, and say so via `synced` rather than
        // silently presenting an unsynced comparison as if it matched.
        const joined = byAtBatIndex && savantArr ? joinSamePlay(byAtBatIndex, savantArr) : null
        const state = joined ?? latestFromMap(byAtBatIndex)
        const savantWp = joined ? joined.savantWp : latestSavantWp(savantArr)
        const synced = joined != null

        const estimatedWp = state != null
          ? estimateWinProb({ scoreDiff: state.homeScore - state.awayScore, periodProgress: periodProgress(state.inning, state.halfBottom) })
          : null

        setRows(g.id, {
          home: g.home, away: g.away, loading: false, error: null,
          homeScore: state?.homeScore, awayScore: state?.awayScore,
          inning: state?.inning, halfBottom: state?.halfBottom,
          estimatedWp, estimatedError: estimatedWp == null ? playsErr : null,
          savantWp, savantError: savantWp == null ? savantErr : null,
          synced, playsBehindSavant: joined?.playsBehindSavant ?? null,
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

  // Real, plain-language payoff -- names tonight's biggest real live gap
  // between the two independently-fetched sources and checks it against
  // the known validated average error, instead of leaving a Δ number on
  // each row for the reader to judge unaided. Only computed over rows
  // that are actually synced (joined at the same real play) with both
  // real numbers present -- an unsynced comparison isn't a real gap.
  const verdict = createMemo(() => {
    const synced = rowList().filter(r => r.synced && r.savantWp != null && r.estimatedWp != null)
    if (!synced.length) return null
    let biggest = synced[0]
    for (const r of synced) {
      if (Math.abs(r.savantWp - r.estimatedWp) > Math.abs(biggest.savantWp - biggest.estimatedWp)) biggest = r
    }
    const gapPts = Math.abs(biggest.savantWp - biggest.estimatedWp) * 100
    const maePts = WP_ESTIMATOR_MAE_REGULATION * 100
    const cmp = gapPts <= maePts ? 'within' : 'above'
    return `Tonight's biggest real live gap: ${biggest.away} @ ${biggest.home}, where the client-side estimate is off by ${gapPts.toFixed(1)}pp -- ${cmp} the validated average error of ${maePts.toFixed(1)}pp.`
  })

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
        source exists at all — this is where it's checked against a real one, live. The two feeds
        are joined by <code>atBatIndex</code> so the score/inning and the Savant number being
        compared are the same real play, not each feed's independently-polled "latest."
      </p>
      <Show when={rowList().length === 0}>
        <p class={styles.empty}>No live MLB games right now.</p>
      </Show>
      <Show when={rowList().length > 0}>
        <Show
          when={verdict()}
          fallback={<p class={styles.verdict}>Live real games in progress, but no synced Savant/estimate pair yet to compare.</p>}
        >
          <p class={styles.verdict}>{verdict()}</p>
        </Show>
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
                    Δ {(Math.abs(row.savantWp - row.estimatedWp) * 100).toFixed(1)}pp
                    {row.synced ? ' (same real play)' : ' (unsynced — feeds not yet joined at a shared play)'}
                  </span>
                </Show>

                <Show when={row.synced && row.playsBehindSavant > 0}>
                  <span class={styles.syncNote}>
                    joined {row.playsBehindSavant} play{row.playsBehindSavant === 1 ? '' : 's'} behind Savant's own latest — that's the newest play both feeds agree on
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
