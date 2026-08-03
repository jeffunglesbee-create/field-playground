// Continuing docs/GROUND-UP-DESIGN.md principle 10: BsdXgPanel renders
// stats.home/away.expected_goals and .ball_possession with only a
// nullish fallback ('??' -- '—'), no range check at all. EPL's 2026-27
// season hasn't started (confirmed live, kicks off 2026-08-21), so
// BsdXgPanel's own current GW1 query always returns null today -- not
// useful for a broad validity sample. Instead this pages through
// /bsd/events/season directly (confirmed working for LISTING even
// though its season= filter is broken -- docs/REAL-API-SURFACE.md) and
// samples real, already-finished events' shotmap data.
//
// Real, not invented, contracts to check:
//   - expected_goals: either null (not started) or a finite,
//     non-negative number.
//   - ball_possession: either null or a number in [0, 100].
//   - home.ball_possession + away.ball_possession ~= 100 when both are
//     non-null (a real mathematical invariant -- possession splits the
//     match, it doesn't sum to something else).
//
// CI-AS-PROXY: field-relay-nba.jeffunglesbee.workers.dev is
// sandbox-blocked from chat.

import { mkdirSync, writeFileSync } from 'node:fs'

mkdirSync('outbox', { recursive: true })
const stamp = new Date().toISOString().replace(/[:.]/g, '-')
const outPath = 'outbox/bsd-xg-validity-probe-' + stamp + '.txt'
const out = []
const log = s => { out.push(s); console.log(s); try { writeFileSync(outPath, out.join('\n')) } catch {} }

const RELAY_BASE = 'https://field-relay-nba.jeffunglesbee.workers.dev'

async function main() {
  log('probe_at: ' + new Date().toISOString())
  log('purpose: are BSD expected_goals/ball_possession valid, not just resolving?')
  log('')

  const eventIds = []
  for (let offset = 0; offset < 300 && eventIds.length < 25; offset += 50) {
    const res = await fetch(RELAY_BASE + '/bsd/events/season?league_id=1&limit=50&offset=' + offset)
    if (!res.ok) { log('offset=' + offset + ': HTTP ' + res.status); break }
    const data = await res.json()
    const results = data.results ?? []
    if (!results.length) break
    for (const r of results) eventIds.push({ id: r.id, status: r.status })
    await new Promise(r => setTimeout(r, 300))
  }
  const finished = eventIds.filter(e => e.status === 'finished')
  const sample = (finished.length ? finished : eventIds).slice(0, 20).map(e => e.id)
  log('real event IDs collected: ' + eventIds.length + ' (' + finished.length + ' finished), sampling: ' + sample.length)
  log('')

  let checked = 0
  let withXg = 0
  const violations = []

  for (const id of sample) {
    const res = await fetch(RELAY_BASE + '/bsd/events/' + id + '/shotmap')
    if (!res.ok) { log('event ' + id + ': HTTP ' + res.status); continue }
    const data = await res.json()
    checked++
    const home = data?.stats?.home
    const away = data?.stats?.away

    for (const [side, s] of [['home', home], ['away', away]]) {
      if (!s) continue
      const xg = s.expected_goals
      if (xg != null) {
        withXg++
        if (typeof xg !== 'number' || !Number.isFinite(xg) || xg < 0) {
          violations.push({ event: id, side, field: 'expected_goals', value: xg })
        }
      }
      const poss = s.ball_possession
      if (poss != null && (typeof poss !== 'number' || !Number.isFinite(poss) || poss < 0 || poss > 100)) {
        violations.push({ event: id, side, field: 'ball_possession', value: poss })
      }
    }

    if (home?.ball_possession != null && away?.ball_possession != null) {
      const sum = home.ball_possession + away.ball_possession
      if (Math.abs(sum - 100) > 2) {
        violations.push({ event: id, field: 'possession_sum', home: home.ball_possession, away: away.ball_possession, sum })
      }
    }
    log('event ' + id + ': home xG=' + (home?.expected_goals ?? 'null') + ' away xG=' + (away?.expected_goals ?? 'null') +
        ' home poss=' + (home?.ball_possession ?? 'null') + ' away poss=' + (away?.ball_possession ?? 'null'))
    await new Promise(r => setTimeout(r, 300))
  }

  log('')
  log('=== RESULT ===')
  log('events checked: ' + checked + '  entries with a real non-null expected_goals: ' + withXg)
  if (!violations.length) {
    log('NONE -- every expected_goals/ball_possession checked was valid, and home+away possession summed to ~100 whenever both were present.')
  } else {
    log('FOUND ' + violations.length + ' violations:')
    for (const v of violations) log('  ' + JSON.stringify(v))
  }

  log('')
  log('=== VERDICT ===')
  if (withXg === 0) {
    log('INCONCLUSIVE: zero real non-null expected_goals values in this sample -- cannot confirm the numeric bound,')
    log('only that ball_possession (where present) and the null-handling itself are consistent. Report honestly, not as a pass.')
  } else if (!violations.length) {
    log('CONFIRMED VALID across ' + withXg + ' real non-null expected_goals values and the possession-sum invariant.')
  } else {
    log('REAL ISSUE FOUND: report exactly what and how many.')
  }
}

main().catch(e => log('FAILED: ' + String(e)))
