// Follow-up to probe-ambient-multiday.mjs and probe-sport-of-week-shape.mjs:
// a parallel review of those two probes' own raw output found two real
// data-quality issues neither probe's pass/fail verdict flagged (both
// verdicts only checked "did values resolve and vary," not "were the
// values valid"):
//   1. night_stars.starScore exceeding 10 on multiple real dates
//      (17/10, 12/10, 10.5/10 seen in the multiday probe's own log) --
//      AmbientPanel's pre-existing SlateVerdict already labels this
//      field "X / 10". Need the FULL raw night_stars shape to tell
//      whether starScore itself is out of range, or whether the
//      already-bounded `stars` (1-5) field used for the star icons is
//      also affected -- two different real risks.
//   2. sport_of_week.allSports has multiple separate, un-normalized
//      entries for the same real sport ("MLB", "Baseball (MLB)", "mlb"
//      all counted independently), which corrupts the winner/summary
//      the endpoint computes -- confirmed today's MLB total is split
//      across at least 3 casings.
//
// Dumps full raw shapes for known-anomalous real dates before deciding
// a fix, rather than guessing.
//
// CI-AS-PROXY: field-relay-nba.jeffunglesbee.workers.dev is
// sandbox-blocked from chat.

import { mkdirSync, writeFileSync } from 'node:fs'

mkdirSync('outbox', { recursive: true })
const stamp = new Date().toISOString().replace(/[:.]/g, '-')
const outPath = 'outbox/ambient-data-quality-probe-' + stamp + '.txt'
const out = []
const log = s => { out.push(s); console.log(s); try { writeFileSync(outPath, out.join('\n')) } catch {} }

const RELAY_BASE = 'https://field-relay-nba.jeffunglesbee.workers.dev'
// 2026-08-02 (starScore=17), 2026-07-29 (starScore=12), 2026-07-26
// (starScore=10.5) per the multiday probe's own log; 2026-07-30
// (starScore=10, in-range) as a control.
const DATES = ['2026-08-02', '2026-07-29', '2026-07-26', '2026-07-30']

function normalizeSport(name) {
  return String(name || '').toLowerCase().replace(/\s*\([^)]*\)\s*/g, '').replace(/[^a-z]/g, '')
}

async function main() {
  log('probe_at: ' + new Date().toISOString())
  for (const date of DATES) {
    const res = await fetch(RELAY_BASE + '/analytics/newspaper/' + date)
    if (!res.ok) { log(date + ': HTTP ' + res.status); continue }
    const data = await res.json()

    log('')
    log('=== ' + date + ' ===')
    log('full raw night_stars: ' + JSON.stringify(data?.night_stars))

    const sow = data?.sport_of_week
    if (sow) {
      log('sport_of_week.winner (backend-computed): ' + sow.winner + ' dramaTotal=' + sow.dramaTotal + ' gamesPlayed=' + sow.gamesPlayed)
      log('sport_of_week.summary (backend-computed): ' + JSON.stringify(sow.summary))
      const grouped = new Map()
      for (const s of sow.allSports || []) {
        const key = normalizeSport(s.sport)
        const cur = grouped.get(key) ?? { games: 0, high_quality: 0, rawLabels: new Set() }
        cur.games += s.games
        cur.high_quality += s.high_quality
        cur.rawLabels.add(s.sport)
        grouped.set(key, cur)
      }
      const reAggregated = [...grouped.entries()]
        .map(([key, v]) => ({ key, games: v.games, high_quality: v.high_quality, rawLabels: [...v.rawLabels] }))
        .sort((a, b) => b.high_quality - a.high_quality)
      log('re-aggregated (normalized casing/variants), top 3:')
      for (const r of reAggregated.slice(0, 3)) {
        log('  ' + r.key + ': high_quality=' + r.high_quality + ' games=' + r.games + ' raw_labels=' + JSON.stringify(r.rawLabels))
      }
      const backendWinnerKey = normalizeSport(sow.winner)
      const realWinnerKey = reAggregated[0]?.key
      log('backend winner (normalized): ' + backendWinnerKey + '  real re-aggregated winner: ' + realWinnerKey +
          '  MATCH: ' + (backendWinnerKey === realWinnerKey))
    } else {
      log('sport_of_week: null')
    }
    await new Promise(r => setTimeout(r, 300))
  }
}

main().catch(e => log('FAILED: ' + String(e)))
