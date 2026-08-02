// Game Symphony Archive — pre-build viability check. Confirms, on a
// real completed dramatic MLB game:
//   1. MLB Stats API's real play objects actually carry a usable
//      wallclock/timing field (shape-first -- dumped, not assumed).
//   2. The shared dramaCueEngine (src/data/dramaCueEngine.js, the
//      exact same rules DramaSoundscape runs live) produces a real,
//      non-trivial cue sequence when run against a real game's
//      reconstructed state timeline.
//
// RECONSTRUCTION METHOD, stated plainly: every score/inning value
// below is real MLB Stats API data for a real game. The 'pre'/'live'/
// 'final' STATUS labels and the synthetic pre-game/post-game bookend
// states are constructed (a real completed game has no live "status"
// field per play the way deskStore's live poller does) -- this is an
// honest reconstruction of what the live poller would have seen, not
// fabricated score/play data.
//
// CI-AS-PROXY: statsapi.mlb.com confirmed sandbox-blocked repeatedly
// this session.

import { mkdirSync, writeFileSync } from 'node:fs'
import { detectCueSequence, CUE_META } from '../src/data/dramaCueEngine.js'

mkdirSync('outbox', { recursive: true })
const stamp = new Date().toISOString().replace(/[:.]/g, '-')
const outPath = 'outbox/symphony-candidate-' + stamp + '.txt'
const out = []
const log = s => {
  out.push(s); console.log(s)
  try { writeFileSync(outPath, out.join('\n')) } catch {}
}

const UA = 'field-playground-probe/1.0 (research)'
const RELAY = 'https://field-relay-nba.jeffunglesbee.workers.dev'

async function fetchJson(url) {
  const res = await fetch(url, { headers: { 'User-Agent': UA } })
  if (!res.ok) return { err: 'HTTP ' + res.status }
  return { data: await res.json() }
}

async function resolveGamePk(date, home, away) {
  const { data, err } = await fetchJson(`https://statsapi.mlb.com/api/v1/schedule?sportId=1&date=${date}`)
  if (err) return null
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

async function main() {
  log('probe_at: ' + new Date().toISOString())
  log('purpose: confirm real MLB play timing field + reconstructed cue sequence for Game Symphony Archive')
  log('')

  const { data: leaderboard, err: lbErr } = await fetchJson(`${RELAY}/archive/drama/leaderboard?sport=MLB&limit=8`)
  if (lbErr) { log('FAILED fetching real leaderboard: ' + lbErr); return }
  const games = leaderboard?.games ?? []
  log('real leaderboard games: ' + games.length)
  if (!games.length) { log('no real games to try'); return }

  let chosen = null
  let allPlays = null
  for (const g of games) {
    const gamePk = await resolveGamePk(g.date, g.home, g.away)
    if (!gamePk) { log('  ' + g.away + ' @ ' + g.home + ': no real gamePk resolved, skipping'); continue }
    await new Promise(r => setTimeout(r, 300))
    const { data: feed, err: feedErr } = await fetchJson(`https://statsapi.mlb.com/api/v1.1/game/${gamePk}/feed/live`)
    if (feedErr) { log('  ' + g.away + ' @ ' + g.home + ': feed fetch failed -- ' + feedErr); continue }
    const plays = feed?.liveData?.plays?.allPlays
    if (!Array.isArray(plays) || plays.length < 10) { log('  ' + g.away + ' @ ' + g.home + ': too few real plays (' + (plays?.length ?? 0) + '), skipping'); continue }
    chosen = { ...g, gamePk }
    allPlays = plays
    log('CHOSEN: ' + g.away + ' @ ' + g.home + '  gamePk=' + gamePk + '  real plays=' + plays.length)
    break
  }
  if (!chosen) { log('no candidate game with a usable real play sequence found'); return }
  log('')

  log('=== SHAPE CHECK: real `about` object on first real play (looking for a timing field) ===')
  log(JSON.stringify(allPlays[0]?.about, null, 2))
  log('')

  // Build the real reconstructed state sequence.
  const states = [{ home_score: null, away_score: null, status: 'pre', went_to_ot: false }]
  for (const p of allPlays) {
    const homeScore = p?.result?.homeScore
    const awayScore = p?.result?.awayScore
    const inning = p?.about?.inning
    if (homeScore == null || awayScore == null || inning == null) continue
    states.push({
      home_score: homeScore, away_score: awayScore, status: 'live', went_to_ot: inning > 9,
      // Real timing field, whatever it's actually called -- captured
      // here for the timeline even though detectCueSequence itself
      // doesn't need it (index-based).
      _startTime: p?.about?.startTime ?? null,
      _endTime: p?.about?.endTime ?? null,
    })
  }
  const last = states[states.length - 1]
  states.push({ home_score: last.home_score, away_score: last.away_score, status: 'final', went_to_ot: last.went_to_ot })

  log('=== REAL RECONSTRUCTED STATE SEQUENCE ===')
  log('total states (incl. synthetic pre/final bookends): ' + states.length)
  log('final real score: ' + chosen.away + ' ' + last.away_score + ' - ' + chosen.home + ' ' + last.home_score)
  log('went to extra innings (real, from inning field): ' + last.went_to_ot)
  log('')

  const events = detectCueSequence(states)
  log('=== REAL RECONSTRUCTED CUE SEQUENCE (shared dramaCueEngine, same rules as live) ===')
  log('total real cues fired: ' + events.length)
  const byType = {}
  for (const e of events) byType[e.cue] = (byType[e.cue] || 0) + 1
  log('by type: ' + JSON.stringify(byType))
  log('')
  for (const e of events) {
    const meta = CUE_META[e.cue]
    const state = states[e.index]
    const startTime = state._startTime
    log(`  [state ${e.index}/${states.length}] ${meta.icon} ${meta.label}  (score at this point: ${state.away_score}-${state.home_score}${startTime ? ', real startTime: ' + startTime : ''})`)
  }

  log('')
  log('=== VERDICT ===')
  log('real cue count: ' + events.length + (events.length > 0 ? ' -- non-trivial, real sequence confirmed' : ' -- EMPTY, this specific game produced no reconstructable cues'))
}

main().catch(e => log('FAILED: ' + String(e?.stack || e)))
