// Applying the lesson from docs/GROUND-UP-DESIGN.md principle 10
// directly: drama_peak/drama_arc are the most heavily-depended-upon
// real fields in this repo (TheUnwatched, HallOfSurprises, BeatTheModel,
// FieldIdentity, DramaSoundscape all trust them), and every consumer
// this session has assumed two things that were only ever spot-checked
// on ONE real game by hand (Rays @ Orioles, TheUnwatched's build doc):
//   1. drama_peak is bounded to a sane real range (implicitly 0-100,
//      matching dramaTier's own hardcoded thresholds).
//   2. drama_peak === Math.max(...JSON.parse(drama_arc)) always --
//      src/data/dramaArcAnalysis.js's analyzeGameArc falls back to
//      Math.max(arc) only when drama_peak isn't a number, silently
//      trusting the field otherwise.
//
// Checks both across a broad, real, multi-sport sample instead of
// assuming a single spot-check generalizes -- the exact gap that let
// the starScore and sport_of_week bugs ship un-flagged.
//
// CI-AS-PROXY: field-relay-nba.jeffunglesbee.workers.dev is
// sandbox-blocked from chat.

import { mkdirSync, writeFileSync } from 'node:fs'

mkdirSync('outbox', { recursive: true })
const stamp = new Date().toISOString().replace(/[:.]/g, '-')
const outPath = 'outbox/drama-peak-validity-probe-' + stamp + '.txt'
const out = []
const log = s => { out.push(s); console.log(s); try { writeFileSync(outPath, out.join('\n')) } catch {} }

const RELAY_BASE = 'https://field-relay-nba.jeffunglesbee.workers.dev'
const SPORTS = ['MLB', 'WNBA', 'MLS', 'NBA', 'NFL']

async function main() {
  log('probe_at: ' + new Date().toISOString())
  log('purpose: is drama_peak bounded and consistent with drama_arc across a broad real sample?')
  log('')

  let totalGames = 0
  let parsedOk = 0
  const outOfRange = []
  const mismatched = []
  const peaks = []

  for (const sport of SPORTS) {
    const res = await fetch(RELAY_BASE + '/archive/drama/leaderboard?sport=' + sport + '&limit=50')
    if (!res.ok) { log(sport + ': HTTP ' + res.status); continue }
    const data = await res.json()
    const games = data?.games ?? []
    log(sport + ': ' + games.length + ' real games returned')
    totalGames += games.length

    for (const g of games) {
      let arc
      try { arc = JSON.parse(g.drama_arc) } catch { continue }
      if (!Array.isArray(arc) || !arc.length) continue
      parsedOk++

      const peak = g.drama_peak
      peaks.push(peak)
      if (typeof peak !== 'number' || peak < 0 || peak > 100) {
        outOfRange.push({ sport, id: g.id, drama_peak: peak })
      }

      const arcMax = Math.max(...arc)
      if (typeof peak === 'number' && arcMax !== peak) {
        mismatched.push({ sport, id: g.id, drama_peak: peak, arc_max: arcMax, diff: peak - arcMax })
      }
    }
    await new Promise(r => setTimeout(r, 300))
  }

  log('')
  log('=== RESULT ===')
  log('total real games returned: ' + totalGames)
  log('games with a parseable drama_arc: ' + parsedOk)
  log('drama_peak range: min=' + Math.min(...peaks) + ' max=' + Math.max(...peaks))
  log('')

  log('=== drama_peak out of [0,100] range ===')
  if (!outOfRange.length) {
    log('NONE -- every real drama_peak checked fell within [0, 100].')
  } else {
    for (const r of outOfRange) log('  ' + JSON.stringify(r))
  }

  log('')
  log('=== drama_peak !== Math.max(drama_arc) mismatches ===')
  if (!mismatched.length) {
    log('NONE -- drama_peak exactly equals Math.max(drama_arc) for every real game checked (' + parsedOk + '/' + parsedOk + ').')
  } else {
    log('FOUND ' + mismatched.length + ' / ' + parsedOk + ' mismatches:')
    for (const m of mismatched.slice(0, 20)) log('  ' + JSON.stringify(m))
    if (mismatched.length > 20) log('  ... and ' + (mismatched.length - 20) + ' more')
  }

  log('')
  log('=== VERDICT ===')
  if (!outOfRange.length && !mismatched.length) {
    log('CONFIRMED VALID: both assumptions hold across ' + parsedOk + ' real games spanning ' + SPORTS.length + ' sports --')
    log('not just resolved and varied, actually checked for range and internal consistency.')
  } else {
    log('REAL ISSUE FOUND: report exactly what and how many, do not build further on the unverified assumption.')
  }
}

main().catch(e => log('FAILED: ' + String(e)))
