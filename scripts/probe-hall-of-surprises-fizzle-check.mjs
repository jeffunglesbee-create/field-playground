// Pre-build check for "Hall of Surprises": TheUnwatched already validated
// one real direction (early tier undervalues eventual drama_peak). Hall of
// Surprises's second, distinct direction is the opposite shape -- a real
// game that reached a high tier early/mid-arc but had FIZZLED by the end
// (its own late-arc values dropped back down), even though drama_peak
// (the archived max-anywhere-in-arc field, confirmed 2026-08-02 in
// TheUnwatched's build) doesn't capture that decline at all.
//
// Not assumed to exist in real data -- the only full real drama_arc this
// session has hand-verified (Rays @ Orioles, 2026-08-02) is a CLIMBER, not
// a fizzle. Before building UI on the fizzle claim, confirm real instances
// exist in a real, broader sample.
//
// CI-AS-PROXY: field-relay-nba.jeffunglesbee.workers.dev is sandbox-blocked
// from chat (confirmed repeatedly this session).

import { mkdirSync, writeFileSync } from 'node:fs'

mkdirSync('outbox', { recursive: true })
const stamp = new Date().toISOString().replace(/[:.]/g, '-')
const outPath = 'outbox/hall-of-surprises-fizzle-check-' + stamp + '.txt'
const out = []
const log = s => { out.push(s); console.log(s); try { writeFileSync(outPath, out.join('\n')) } catch {} }

const RELAY_BASE = 'https://field-relay-nba.jeffunglesbee.workers.dev'

function tierOf(v) {
  if (v >= 80) return 'fire'
  if (v >= 60) return 'hot'
  if (v >= 40) return 'warm'
  return 'cold'
}
const TIER_RANK = { cold: 0, warm: 1, hot: 2, fire: 3 }

async function main() {
  log('probe_at: ' + new Date().toISOString())
  log('purpose: does a real hot-early-then-fizzled pattern exist in real drama_arc data?')
  log('')

  const sport = 'MLB'
  const res = await fetch(RELAY_BASE + '/archive/drama/leaderboard?sport=' + sport + '&limit=30')
  if (!res.ok) { log('FAILED: leaderboard fetch HTTP ' + res.status); return }
  const data = await res.json()
  const games = data?.games ?? []
  log('games returned: ' + games.length)
  log('')

  let parsedOk = 0
  const fizzles = []
  const climbers = []

  for (const g of games) {
    let arc
    try { arc = JSON.parse(g.drama_arc) } catch { continue }
    if (!Array.isArray(arc) || arc.length < 10) continue
    parsedOk++

    const window = Math.max(5, Math.floor(arc.length * 0.2))
    const earlyMax = Math.max(...arc.slice(0, window))
    const lateMax = Math.max(...arc.slice(-window))
    const overallPeak = Math.max(...arc)
    const peakMatchesField = overallPeak === g.drama_peak

    const row = {
      matchup: g.away + ' @ ' + g.home,
      date: g.date,
      dramaPeak: g.drama_peak,
      overallPeak,
      peakMatchesField,
      earlyMax,
      lateMax,
      earlyTier: tierOf(earlyMax),
      lateTier: tierOf(lateMax),
      peakTier: tierOf(overallPeak),
    }

    if (TIER_RANK[row.peakTier] >= 2 && TIER_RANK[row.peakTier] - TIER_RANK[row.lateTier] >= 1) {
      fizzles.push(row)
    }
    if (TIER_RANK[row.earlyTier] < TIER_RANK[row.peakTier]) {
      climbers.push(row)
    }
  }

  log('games with a parseable drama_arc (length >= 10): ' + parsedOk + ' / ' + games.length)
  log('drama_peak field always equals max(arc) in this sample: ' +
      (games.length ? 'checked below per-row' : 'n/a'))
  log('')

  log('=== FIZZLE candidates (peak tier >= hot, late-window tier dropped >= 1 tier) ===')
  if (!fizzles.length) {
    log('NONE FOUND in this sample.')
  } else {
    for (const r of fizzles) {
      log(r.matchup + ' (' + r.date + ')  peak=' + r.overallPeak + '(' + r.peakTier + ', matches drama_peak field: ' + r.peakMatchesField + ')' +
          '  late_window_max=' + r.lateMax + '(' + r.lateTier + ')  early_window_max=' + r.earlyMax + '(' + r.earlyTier + ')')
    }
  }
  log('')
  log('climber candidates found (TheUnwatched direction, cross-check): ' + climbers.length)
  log('')

  log('=== VERDICT ===')
  if (fizzles.length > 0) {
    log('CONFIRMED: real fizzle pattern (hot/fire peak, dropped back down by late-arc window) exists')
    log('in real, current archived data. Safe to build the reverse-direction ranking on real data.')
  } else {
    log('NOT CONFIRMED in this sample: no real fizzle found among ' + parsedOk + ' parsed games.')
    log('Do not ship a "fizzle" ranking direction as if it reflects real, observed games until a real')
    log('instance is found -- report this honestly rather than building on an unconfirmed claim.')
  }
}

main().catch(e => log('FAILED: ' + String(e)))
