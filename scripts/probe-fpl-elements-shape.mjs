// Verify BEFORE building Value Night around it: this codebase has
// already been burned once assuming an unverified field shape
// (BsdXgPanel/index.jsx's header comment -- /bsd/contract's
// illustrative example didn't match the real API). FPL's
// bootstrap-static `elements` array (real players) has never been
// read by anything in this repo -- only `teams` has (BsdXgPanel). This
// checks the real, live shape directly before any component code
// gets written against it.

import { mkdirSync, writeFileSync } from 'node:fs'

mkdirSync('outbox', { recursive: true })
const stamp = new Date().toISOString().replace(/[:.]/g, '-')
const outPath = 'outbox/fpl-elements-shape-' + stamp + '.txt'
const out = []
const log = s => { out.push(s); console.log(s); try { writeFileSync(outPath, out.join('\n')) } catch {} }

async function main() {
  log('probe_at: ' + new Date().toISOString())
  const res = await fetch('https://field-relay-nba.jeffunglesbee.workers.dev/fpl/bootstrap-static')
  log('HTTP status: ' + res.status)
  if (!res.ok) { log('FAILED: non-200 response'); process.exit(1) }
  const data = await res.json()
  const elements = data.elements ?? []
  log('elements count: ' + elements.length)
  if (!elements.length) { log('FAILED: no elements returned'); process.exit(1) }

  const sample = elements[0]
  log('sample element keys: ' + JSON.stringify(Object.keys(sample)))
  log('sample element (raw): ' + JSON.stringify(sample, null, 2))

  // Real fields the design needs: does now_cost look like tenths of a
  // million (standard FPL convention, e.g. 125 -> £12.5m)? Does
  // total_points vary meaningfully across players (not all zero, which
  // would mean pre-season/no data yet)?
  const costs = elements.map(e => e.now_cost).filter(n => typeof n === 'number')
  const points = elements.map(e => e.total_points).filter(n => typeof n === 'number')
  log('now_cost present on: ' + costs.length + '/' + elements.length + ', range: ' + Math.min(...costs) + '-' + Math.max(...costs))
  log('total_points present on: ' + points.length + '/' + elements.length + ', range: ' + Math.min(...points) + '-' + Math.max(...points) + ', nonzero: ' + points.filter(p => p > 0).length)

  const withBoth = elements.filter(e => typeof e.now_cost === 'number' && e.now_cost > 0 && typeof e.total_points === 'number' && e.total_points > 0)
  log('elements with real usable now_cost AND total_points > 0: ' + withBoth.length)

  log('')
  log('=== VERDICT ===')
  if (withBoth.length >= 10) {
    log('CONFIRMED: real, usable now_cost + total_points fields on ' + withBoth.length + ' real players -- safe to build Value Night against these field names.')
  } else {
    log('INCONCLUSIVE: too few players have both a real cost and real points this early in the season -- report exactly what was observed, do not assume the field names are wrong, may just be too early (GW1 not played yet).')
  }
}

main().catch(e => { log('FAILED: ' + String(e?.stack ?? e)); process.exit(1) })
