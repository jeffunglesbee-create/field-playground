// Follow-up to probe-ambient-multiday.mjs, which found sport_of_week
// renders as "[object Object]" on real dates including today
// (2026-08-03) -- AmbientPanel's SportOfWeekBanner renders {props.sport}
// assuming a plain string, but it's sometimes a nested object. Dumps the
// raw real shape before touching the fix, rather than guessing a field
// name.

import { mkdirSync, writeFileSync } from 'node:fs'

mkdirSync('outbox', { recursive: true })
const stamp = new Date().toISOString().replace(/[:.]/g, '-')
const outPath = 'outbox/sport-of-week-shape-probe-' + stamp + '.txt'
const out = []
const log = s => { out.push(s); console.log(s); try { writeFileSync(outPath, out.join('\n')) } catch {} }

const RELAY_BASE = 'https://field-relay-nba.jeffunglesbee.workers.dev'
const DATES = ['2026-08-03', '2026-07-27', '2026-08-02', '2026-08-01']

async function main() {
  log('probe_at: ' + new Date().toISOString())
  for (const date of DATES) {
    const res = await fetch(RELAY_BASE + '/analytics/newspaper/' + date)
    if (!res.ok) { log(date + ': HTTP ' + res.status); continue }
    const data = await res.json()
    log(date + ': typeof sport_of_week = ' + typeof data?.sport_of_week)
    log(date + ': raw sport_of_week = ' + JSON.stringify(data?.sport_of_week))
    await new Promise(r => setTimeout(r, 300))
  }
}

main().catch(e => log('FAILED: ' + String(e)))
