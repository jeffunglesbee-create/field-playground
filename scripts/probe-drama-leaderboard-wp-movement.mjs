// Pre-build check for "round 3 in the playground first": before adding
// a live WP-movement column to DramaLeaderboard, confirm two things
// against REAL CURRENT data, not the round-3 investigation's cached
// 28-game sample:
//   1. The real leaderboard response's exact shape -- does each game
//      carry a `date` field? Round 3's method needs date+team names to
//      resolve a real MLB gamePk (Savant's own ID system, distinct
//      from whatever the leaderboard uses). Not assumed from relay.js's
//      own comment, which never mentions a date field either way.
//   2. That the exact validated method (probe-savant-wp-metrics.mjs's
//      resolveGamePk + fetchSavantWpa + total/late movement, same /100
//      scale fix) still produces real, distinct values for THESE
//      specific leaderboard games -- a fresh confirmation, not a reuse
//      of round 3's already-answered question.
//
// CI-AS-PROXY: field-relay-nba.jeffunglesbee.workers.dev, statsapi.mlb.com,
// and baseballsavant.mlb.com are all sandbox-blocked from chat (confirmed
// directly, all three, before writing this script).

import { mkdirSync, writeFileSync } from 'node:fs'

mkdirSync('outbox', { recursive: true })
const stamp = new Date().toISOString().replace(/[:.]/g, '-')
const outPath = 'outbox/drama-leaderboard-wp-movement-probe-' + stamp + '.txt'
const out = []
const log = s => { out.push(s); console.log(s); try { writeFileSync(outPath, out.join('\n')) } catch {} }

const UA = 'field-playground-probe/1.0 (github.com/jeffunglesbee-create/field-playground; research)'
const RELAY_BASE = 'https://field-relay-nba.jeffunglesbee.workers.dev'

async function resolveGamePk(date, home, away) {
  const url = 'https://statsapi.mlb.com/api/v1/schedule?sportId=1&date=' + date
  const res = await fetch(url, { headers: { 'User-Agent': UA } })
  if (!res.ok) return null
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

async function fetchSavantWpa(gamePk) {
  const res = await fetch('https://baseballsavant.mlb.com/gf?game_pk=' + gamePk, { headers: { 'User-Agent': UA } })
  if (!res.ok) return { err: 'HTTP ' + res.status }
  const data = await res.json()
  const arr = data?.scoreboard?.stats?.wpa?.gameWpa
  if (!Array.isArray(arr) || !arr.length) return { err: 'gameWpa empty or missing' }
  return { arr }
}

function inningOf(e) {
  const m = /^[TB](\d+)/.exec(String(e?.i ?? ''))
  return m ? parseInt(m[1], 10) : null
}

async function main() {
  log('probe_at: ' + new Date().toISOString())
  log('purpose: does round 3\'s validated WP-movement method work on TODAY\'s real leaderboard games?')
  log('')

  const res = await fetch(RELAY_BASE + '/archive/drama/leaderboard?sport=MLB&limit=8')
  if (!res.ok) { log('FAILED: leaderboard fetch HTTP ' + res.status); return }
  const data = await res.json()
  const games = data?.games ?? []

  log('=== RAW SHAPE (first game, full object) ===')
  log(JSON.stringify(games[0], null, 2))
  log('')
  log('all top-level keys present across all ' + games.length + ' games: ' +
      [...new Set(games.flatMap(g => Object.keys(g)))].join(', '))
  log('')

  const hasDate = games.every(g => typeof g.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(g.date))
  log('every game has a real YYYY-MM-DD date field: ' + hasDate)
  if (!hasDate) {
    log('STOPPING: without a real date per game, gamePk resolution cannot proceed honestly -- not guessing a date.')
    return
  }

  log('')
  log('=== WP MOVEMENT vs EXISTING drama_peak, same real games ===')
  const rows = []
  for (const g of games) {
    const pk = await resolveGamePk(g.date, g.home, g.away)
    if (!pk) { log('SKIP ' + g.away + ' @ ' + g.home + ' (' + g.date + '): no gamePk resolved'); continue }
    await new Promise(r => setTimeout(r, 300))

    const wpaResult = await fetchSavantWpa(pk)
    if (wpaResult.err) { log('SKIP ' + g.away + ' @ ' + g.home + ': Savant ' + wpaResult.err); await new Promise(r => setTimeout(r, 300)); continue }
    const arr = wpaResult.arr

    const totalMovement = arr.reduce((s, e) => s + Math.abs(Number(e?.homeTeamWinProbabilityAdded ?? 0) / 100), 0)
    const lateEntries = arr.filter(e => { const inn = inningOf(e); return inn != null && inn >= 7 })
    const lateMovement = lateEntries.reduce((s, e) => s + Math.abs(Number(e?.homeTeamWinProbabilityAdded ?? 0) / 100), 0)

    rows.push({ matchup: g.away + ' @ ' + g.home, dramaPeak: g.drama_peak, totalMovement, lateMovement })
    log(g.away + ' @ ' + g.home + '  drama_peak=' + g.drama_peak +
        '  total_wp_movement=' + totalMovement.toFixed(3) + '  late_wp_movement=' + lateMovement.toFixed(3))
    await new Promise(r => setTimeout(r, 400))
  }

  log('')
  log('=== RESULT ===')
  log('games resolved with real Savant WP data: ' + rows.length + ' / ' + games.length)
  if (rows.length) {
    const peaks = rows.map(r => r.dramaPeak)
    const totals = rows.map(r => r.totalMovement)
    log('drama_peak distinct: ' + new Set(peaks).size + '/' + peaks.length)
    log('total_wp_movement distinct: ' + new Set(totals.map(v => v.toFixed(3))).size + '/' + totals.length)
  }

  log('')
  log('=== VERDICT ===')
  if (rows.length >= Math.ceil(games.length * 0.6)) {
    log('CONFIRMED: round 3\'s method resolves real gamePks and real Savant WP data for the CURRENT')
    log('live leaderboard, not just the historical round-3 sample. Safe to build a live UI on this.')
  } else {
    log('NOT CONFIRMED: too many of the current leaderboard games failed to resolve -- report exactly')
    log('what failed and why before building any UI on this method.')
  }
}

main().catch(e => log('FAILED: ' + String(e)))
