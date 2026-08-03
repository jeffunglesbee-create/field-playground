// Corrected version of the original fizzle-check probe.
//
// REAL, CONFIRMED PROBLEM WITH THE ORIGINAL: it only queried MLB's top
// 30 games BY drama_peak. That sort order is structurally biased
// against finding a fizzle pattern -- a game that peaked early/mid-arc
// then went quiet will almost always have a LOWER overall peak than a
// game that built tension and climaxed late (extra innings, a
// ninth-inning comeback), since late-game high-leverage moments tend
// to produce the highest raw scores. So "top N by peak" will
// systematically under-represent exactly the shape this probe is
// looking for, independent of whether the underlying drama data is
// correct. Confirmed directly: a re-run against the corrected,
// post-bug-fix drama data (2026-08-03) still found zero fizzles in
// MLB's top 30 -- all 30 were climbers, which is the sampling bias
// manifesting, not a data-quality problem (the data itself now shows
// real variation, confirmed separately).
//
// THE FIX HERE: widen the pool across every sport with real archived
// drama data (confirmed live, this session: MLB, WNBA, MLS, EPL, AFL),
// each pulled at the endpoint's own max limit (50). This does NOT
// fully eliminate the structural bias -- the endpoint still only ever
// sorts by drama_peak DESC, so this is a wider peak-biased sample, not
// an unbiased one. That limitation is stated honestly in this script's
// own output rather than presented as solved.
//
// CI-AS-PROXY: field-relay-nba.jeffunglesbee.workers.dev is
// sandbox-blocked from chat (confirmed repeatedly this session).

import { mkdirSync, writeFileSync } from 'node:fs'

mkdirSync('outbox', { recursive: true })
const stamp = new Date().toISOString().replace(/[:.]/g, '-')
const outPath = 'outbox/hall-of-surprises-fizzle-check-v2-' + stamp + '.txt'
const out = []
const log = s => { out.push(s); console.log(s); try { writeFileSync(outPath, out.join('\n')) } catch {} }

const RELAY_BASE = 'https://field-relay-nba.jeffunglesbee.workers.dev'

// Confirmed live this session -- each returns real games, not empty.
// 'WORLD CUP' was tried and returned 0; not included since it's not
// confirmed to be a real, queryable value for this endpoint.
const SPORTS = ['MLB', 'WNBA', 'MLS', 'EPL', 'AFL']

function tierOf(v) {
  if (v >= 80) return 'fire'
  if (v >= 60) return 'hot'
  if (v >= 40) return 'warm'
  return 'cold'
}
const TIER_RANK = { cold: 0, warm: 1, hot: 2, fire: 3 }

async function fetchSport(sport) {
  const res = await fetch(RELAY_BASE + '/archive/drama/leaderboard?sport=' + encodeURIComponent(sport) + '&limit=50')
  if (!res.ok) { log('  ' + sport + ': FAILED HTTP ' + res.status); return [] }
  const data = await res.json()
  const games = data?.games ?? []
  log('  ' + sport + ': ' + games.length + ' real games')
  return games.map(g => ({ ...g, _sport: sport }))
}

async function main() {
  log('probe_at: ' + new Date().toISOString())
  log('purpose: does a real hot-early-then-fizzled pattern exist, across a wider, multi-sport pool')
  log('KNOWN LIMITATION (disclosed, not hidden): /archive/drama/leaderboard only ever sorts by')
  log('drama_peak DESC with a max limit of 50 -- this widens the pool across sports but does NOT')
  log('produce a truly unbiased sample. A real fizzle game with a modest overall peak could still')
  log('be excluded if it never cracks the top 50 for its own sport.')
  log('')
  log('=== fetching all confirmed-real sports ===')

  const allGames = []
  for (const sport of SPORTS) {
    const games = await fetchSport(sport)
    allGames.push(...games)
  }
  log('')
  log('total games across all sports: ' + allGames.length)
  log('')

  let parsedOk = 0
  const fizzles = []
  const climbers = []

  for (const g of allGames) {
    let arc
    try { arc = JSON.parse(g.drama_arc) } catch { continue }
    if (!Array.isArray(arc) || arc.length < 10) continue
    parsedOk++

    const window = Math.max(5, Math.floor(arc.length * 0.2))
    const earlyMax = Math.max(...arc.slice(0, window))
    const lateMax = Math.max(...arc.slice(-window))
    const overallPeak = Math.max(...arc)
    const peakIdx = arc.indexOf(overallPeak)
    const peakFrac = peakIdx / (arc.length - 1)

    const row = {
      sport: g._sport,
      matchup: g.away + ' @ ' + g.home,
      date: g.date,
      dramaPeak: g.drama_peak,
      overallPeak,
      earlyMax, lateMax,
      earlyTier: tierOf(earlyMax),
      lateTier: tierOf(lateMax),
      peakTier: tierOf(overallPeak),
      peakFrac: peakFrac.toFixed(2),
    }

    // Same real test as the original: peak reached at least 'hot', and
    // the late-window max dropped at least one full tier below it.
    if (TIER_RANK[row.peakTier] >= 2 && TIER_RANK[row.peakTier] - TIER_RANK[row.lateTier] >= 1) {
      fizzles.push(row)
    }
    if (TIER_RANK[row.earlyTier] < TIER_RANK[row.peakTier]) {
      climbers.push(row)
    }
  }

  log('games with a parseable drama_arc (length >= 10): ' + parsedOk + ' / ' + allGames.length)
  log('')

  log('=== FIZZLE candidates (peak tier >= hot, late-window tier dropped >= 1 tier) ===')
  if (!fizzles.length) {
    log('NONE FOUND, even across the widened, multi-sport pool.')
  } else {
    for (const r of fizzles) {
      log('[' + r.sport + '] ' + r.matchup + ' (' + r.date + ')  peak=' + r.overallPeak + '(' + r.peakTier +
          ', at ' + r.peakFrac + ' through the arc)  late_window_max=' + r.lateMax + '(' + r.lateTier + ')' +
          '  early_window_max=' + r.earlyMax + '(' + r.earlyTier + ')')
    }
  }
  log('')
  log('climber candidates (cross-check, TheUnwatched direction): ' + climbers.length + ' / ' + parsedOk)
  log('')

  log('=== VERDICT ===')
  if (fizzles.length > 0) {
    log('CONFIRMED: real fizzle pattern exists in real, current archived data across ' + SPORTS.length + ' sports.')
    log('Safe to build the reverse-direction ranking on real data.')
  } else {
    log('STILL NOT CONFIRMED, even with a wider pool across ' + SPORTS.length + ' sports (' + parsedOk + ' games parsed).')
    log('Two honest possibilities remain open, not resolved by this run: (1) the sampling bias')
    log('described above still suppresses real fizzle games that exist but never crack a top-50-by-peak')
    log('cut, or (2) fizzle games are genuinely rare/absent from what actually gets archived right now.')
    log('This script cannot distinguish between those two on its own. Do not ship a "fizzle" ranking')
    log('direction as if confirmed until one of them is ruled out -- e.g. via a real, non-peak-sorted')
    log('archive query if one becomes available.')
  }
}

main().catch(e => log('FAILED: ' + String(e)))
