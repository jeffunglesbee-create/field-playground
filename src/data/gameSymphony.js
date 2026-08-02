// Game Symphony Archive's data layer. Reconstructs a completed, real
// dramatic MLB game's actual cue sequence and timing from real MLB
// Stats API play data -- validated pre-build via
// scripts/probe-symphony-candidate-game.mjs (CI, since statsapi.mlb.com
// is sandbox-blocked): real timing field is `about.startTime` (ISO
// string), and the shared dramaCueEngine produces a real, non-trivial
// sequence when the real per-play states are BUCKETED to match live
// polling granularity first.
//
// WHY BUCKETING, not raw per-play: the probe's first attempt fed every
// individual real play into the cue engine (109 real plays for one
// real game) and only 2 of 5 possible cues fired. Real cause, not a
// bug: DramaSoundscape's live thresholds (margin shrinks 3+ "in one
// tick") are tuned for App.jsx's real 15s poll interval
// (POLL_INTERVAL_MS), which naturally skips several real plays between
// snapshots -- a single play rarely swings a margin by 3+ runs, but
// several plays in a 15s window can. Bucketing real plays into 15s
// real-wallclock windows (via the real startTime field) and comparing
// bucket-to-bucket, not play-to-play, reproduces what a live listener
// actually would have heard, not an artificially finer-grained replay
// the live thresholds were never tuned for.
//
// DIRECT client fetch, not routed through field-relay-nba for the
// score/play data: statsapi.mlb.com confirmed CORS-open earlier this
// session (same basis LiveWpTicker/BsdXgPanel/dramaWpMovement.js
// already rely on). field-relay-nba is still used for the initial
// "which real dramatic games exist" list (dramaLeaderboard, already an
// established resource) -- not duplicated here.

import { detectCueSequence } from './dramaCueEngine'

const LIVE_POLL_INTERVAL_MS = 15000 // real value, App.jsx's own POLL_INTERVAL_MS
const REPLAY_DURATION_MS = 20000 // the pitch's own "20 seconds" target

async function resolveGamePk(date, home, away) {
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
  return match?.gamePk ?? null
}

async function fetchRealPlays(gamePk) {
  const res = await fetch(`https://statsapi.mlb.com/api/v1.1/game/${gamePk}/feed/live`)
  if (!res.ok) throw new Error('live feed HTTP ' + res.status)
  const data = await res.json()
  const plays = data?.liveData?.plays?.allPlays
  if (!Array.isArray(plays) || !plays.length) return null
  return plays
}

// Real per-play states, each tagged with its real wallclock startTime
// (ms since epoch) for bucketing.
function buildRawStates(plays) {
  const states = []
  for (const p of plays) {
    const homeScore = p?.result?.homeScore
    const awayScore = p?.result?.awayScore
    const inning = p?.about?.inning
    const startTime = p?.about?.startTime
    if (homeScore == null || awayScore == null || inning == null || !startTime) continue
    const ts = Date.parse(startTime)
    if (!Number.isFinite(ts)) continue
    states.push({ home_score: homeScore, away_score: awayScore, status: 'live', went_to_ot: inning > 9, ts })
  }
  return states
}

// Groups real per-play states into real-wallclock buckets matching the
// live poll interval, keeping the LAST real state observed within each
// bucket (same "snapshot at poll time" semantics the live version has).
function bucketStates(rawStates, bucketMs) {
  if (!rawStates.length) return []
  const start = rawStates[0].ts
  const buckets = new Map()
  for (const s of rawStates) {
    const bucketIdx = Math.floor((s.ts - start) / bucketMs)
    buckets.set(bucketIdx, s) // later plays in the same bucket overwrite -- "last observed"
  }
  return [...buckets.keys()].sort((a, b) => a - b).map(idx => buckets.get(idx))
}

// Public entry point: fetch a real completed game and reconstruct its
// real cue timeline, compressed into REPLAY_DURATION_MS while
// preserving the REAL relative pacing of when each cue actually
// happened (a cue that occurred 90% of the way through the real game
// plays back near the end of the compressed replay, not at a random
// point).
export async function buildGameSymphony(date, home, away) {
  const gamePk = await resolveGamePk(date, home, away)
  if (!gamePk) return { error: 'no real gamePk resolved' }

  const plays = await fetchRealPlays(gamePk)
  if (!plays) return { error: 'no real play data returned' }

  const rawStates = buildRawStates(plays)
  if (rawStates.length < 2) return { error: 'too few real states with usable timing to reconstruct' }

  const bucketed = bucketStates(rawStates, LIVE_POLL_INTERVAL_MS)
  const withBookends = [
    { home_score: null, away_score: null, status: 'pre', went_to_ot: false, ts: bucketed[0].ts },
    ...bucketed,
    { ...bucketed[bucketed.length - 1], status: 'final' },
  ]

  const events = detectCueSequence(withBookends)
  if (!events.length) {
    return {
      error: null, gamePk, plays: plays.length, states: withBookends.length,
      cues: [], noEventsReason: 'this real game\'s reconstructed sequence triggered no cues at 15s-bucket granularity',
    }
  }

  const gameStartTs = withBookends[0].ts
  const gameEndTs = withBookends[withBookends.length - 1].ts
  const realDurationMs = Math.max(1, gameEndTs - gameStartTs)

  const cues = events.map(e => {
    const state = withBookends[e.index]
    const realElapsedMs = state.ts - gameStartTs
    const compressedOffsetMs = Math.round((realElapsedMs / realDurationMs) * REPLAY_DURATION_MS)
    return { cue: e.cue, compressedOffsetMs, realElapsedMs, score: `${state.away_score}-${state.home_score}` }
  })

  return { error: null, gamePk, plays: plays.length, states: withBookends.length, cues, replayDurationMs: REPLAY_DURATION_MS }
}
