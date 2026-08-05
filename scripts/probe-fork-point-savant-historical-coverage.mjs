// Fork Point currently splices `drama_arc` (a derived excitement score),
// not real win probability -- because no client-side WP model exists to
// "rerun." But this repo already has a REAL, validated alternative:
// round 3's method (docs/outbox/chat-update-2026-07-30-drama-scoring-
// round3.md) resolves an MLB game's real statsapi.mlb.com `gamePk` from
// date+team names, then reads REAL per-play win probability straight
// from baseballsavant.mlb.com/gf?game_pk=X (`gameWpa`). Already proven
// 28/28 on a historical sample (dates 2026-07-16/17) and re-confirmed
// 2026-08-01 against "today's" top-8 leaderboard games
// (scripts/probe-drama-leaderboard-wp-movement.mjs).
//
// Neither prior probe answers the one question that matters for Fork
// Point specifically: Fork Point draws its real candidate pool from
// `/archive/drama/leaderboard?sport=MLB&limit=50` -- a much wider, and
// potentially much OLDER, real date spread than "today's top 8" or the
// round-3 sample (which was tested only ~2 weeks after those games were
// played). Does statsapi.mlb.com's schedule endpoint still resolve a
// gamePk, and does Savant still serve a real gameWpa array, for the
// OLDEST real games actually sitting in that pool -- not just recent
// ones?
//
// CI-AS-PROXY: field-relay-nba.jeffunglesbee.workers.dev,
// statsapi.mlb.com, and baseballsavant.mlb.com are all sandbox-blocked
// from chat (confirmed repeatedly this session) -- same pattern as
// every prior Savant/statsapi probe.

import { mkdirSync, writeFileSync } from 'node:fs'

mkdirSync('outbox', { recursive: true })
const stamp = new Date().toISOString().replace(/[:.]/g, '-')
const outPath = 'outbox/fork-point-savant-historical-coverage-probe-' + stamp + '.txt'
const out = []
const log = s => { out.push(s); console.log(s); try { writeFileSync(outPath, out.join('\n')) } catch {} }

const UA = 'field-playground-probe/1.0 (github.com/jeffunglesbee-create/field-playground; research)'
const RELAY_BASE = 'https://field-relay-nba.jeffunglesbee.workers.dev'

async function resolveGamePk(date, home, away) {
  const url = 'https://statsapi.mlb.com/api/v1/schedule?sportId=1&date=' + date
  const res = await fetch(url, { headers: { 'User-Agent': UA } })
  if (!res.ok) return { err: 'schedule HTTP ' + res.status }
  const data = await res.json()
  const games = data?.dates?.[0]?.games ?? []
  const norm = s => (s || '').toLowerCase().replace(/[^a-z]/g, '')
  const h = norm(home), a = norm(away)
  const match = games.find(g => {
    const gh = norm(g.teams?.home?.team?.name)
    const ga = norm(g.teams?.away?.team?.name)
    return (gh.includes(h) || h.includes(gh)) && (ga.includes(a) || a.includes(ga))
  })
  return match ? { gamePk: match.gamePk } : { err: 'no schedule match (real games that day: ' + games.length + ')' }
}

async function fetchSavantWp(gamePk) {
  const res = await fetch('https://baseballsavant.mlb.com/gf?game_pk=' + gamePk, { headers: { 'User-Agent': UA } })
  if (!res.ok) return { err: 'Savant HTTP ' + res.status }
  const data = await res.json()
  const arr = data?.scoreboard?.stats?.wpa?.gameWpa
  if (!Array.isArray(arr) || !arr.length) return { err: 'gameWpa empty or missing' }
  return { count: arr.length }
}

async function main() {
  log('probe_at: ' + new Date().toISOString())
  log('purpose: does real gamePk resolution + real Savant WP coverage hold across Fork Point\'s')
  log('FULL real candidate pool (limit=50), especially its OLDEST real games -- not just recent ones?')
  log('')

  const res = await fetch(RELAY_BASE + '/archive/drama/leaderboard?sport=MLB&limit=50', { headers: { 'User-Agent': UA } })
  if (!res.ok) { log('FAILED: leaderboard fetch HTTP ' + res.status); return }
  const data = await res.json()
  const games = (data?.games ?? []).filter(g => typeof g.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(g.date))
  log('real candidate pool size (with a usable date): ' + games.length)
  if (!games.length) { log('STOPPING: no usable real games.'); return }

  const sorted = [...games].sort((a, b) => a.date.localeCompare(b.date))
  log('real date spread: ' + sorted[0].date + ' .. ' + sorted[sorted.length - 1].date)
  log('')

  // Sample the 6 OLDEST (the genuinely untested end), 3 newest (sanity
  // check against the already-validated end), and up to 6 evenly spaced
  // through the middle -- deduped. Bounded sample size to stay polite to
  // both real external hosts, not an attempt to cover all 50.
  const sample = new Map()
  const addAll = list => list.forEach(g => sample.set(g.away + '|' + g.home + '|' + g.date, g))
  addAll(sorted.slice(0, 6))
  addAll(sorted.slice(-3))
  for (let i = 0; i < 6; i++) {
    const idx = Math.round((i / 5) * (sorted.length - 1))
    addAll([sorted[idx]])
  }
  const sampleGames = [...sample.values()]
  log('sampling ' + sampleGames.length + ' real games across the full spread (oldest-weighted):')
  log('')

  const results = []
  const today = new Date()
  for (const g of sampleGames) {
    const ageDays = Math.round((today - new Date(g.date)) / 86400000)
    const pk = await resolveGamePk(g.date, g.home, g.away)
    await new Promise(r => setTimeout(r, 300))
    let wp = { err: 'not attempted (no gamePk)' }
    if (pk.gamePk) {
      wp = await fetchSavantWp(pk.gamePk)
      await new Promise(r => setTimeout(r, 300))
    }
    const ok = !!wp.count
    results.push({ ...g, ageDays, ...pk, ...wp, ok })
    log((ok ? 'OK  ' : 'FAIL') + '  ' + g.date + ' (' + ageDays + 'd old)  ' + g.away + ' @ ' + g.home +
        '  ' + (pk.gamePk ? 'gamePk=' + pk.gamePk : 'gamePk: ' + pk.err) +
        '  ' + (ok ? 'wp_points=' + wp.count : 'wp: ' + wp.err))
  }

  log('')
  log('=== RESULT ===')
  const okCount = results.filter(r => r.ok).length
  log('resolved with real Savant WP data: ' + okCount + ' / ' + results.length)
  const failures = results.filter(r => !r.ok)
  if (failures.length) {
    log('failures, oldest-first: ' + failures.map(r => r.date + ' (' + r.ageDays + 'd)').join(', '))
  }
  const oldestOk = results.filter(r => r.ok).sort((a, b) => b.ageDays - a.ageDays)[0]
  log('oldest real game that STILL resolved: ' + (oldestOk ? oldestOk.date + ' (' + oldestOk.ageDays + 'd old)' : 'none'))

  log('')
  log('=== VERDICT ===')
  if (okCount === results.length) {
    log('CONFIRMED: real gamePk + real Savant WP coverage holds across the FULL real date spread this')
    log('sample pool actually has, including its oldest real games. Safe to build real-WP splicing for')
    log('MLB Fork Point candidates on this exact method -- no coverage gap found at this sample size.')
  } else if (okCount >= Math.ceil(results.length * 0.6)) {
    log('PARTIALLY CONFIRMED: most real games resolved, but real failures exist -- see the failure list')
    log('above. Any real-WP Fork Point build MUST show an honest "real WP unavailable for this real')
    log('game" state for the games that fail, not silently fall back without disclosure.')
  } else {
    log('NOT CONFIRMED: too many real games in this pool fail to resolve real Savant WP data. Real-WP')
    log('splicing is not safe to build as the default path without a much better honest fallback story.')
  }
}

main().catch(e => log('FAILED: ' + String(e)))
