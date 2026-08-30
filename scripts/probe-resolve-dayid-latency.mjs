// How long does an UNCACHED resolve-dayid actually take?
//
// THE CLAIM THIS SETTLES
//
// `bundesliga-resolve-dayid-only-answers-from-cache-within-client-timeout`
// (DERIVED, 82%, 2026-08-23): "resolve-dayid answers fast only when the date is
// already cached ... an uncached date cannot complete in the client either."
//
// Its own derivedFrom states the gap precisely:
//
//   NOT measured: the actual uncached latency, only that it exceeds 20s -- it
//   could be 21s or 90s, which changes how fixable this is.
//
// That is the whole point. A 21s call is a timeout that could be raised; a 90s
// call is a route that has to change. The earlier probe used a 20s
// AbortSignal.timeout, so every uncached date came back as the same
// indistinguishable TimeoutError. This one waits long enough to get a number.
//
// THREE STATES, and the middle one is not a pass:
//   cached      the relay had it warm. Says nothing about the cold path.
//   MEASURED    a completion time in ms, compared against the client's budget.
//   >CAP        still running at the cap. Reported as a lower bound, never as
//               a measurement, and never as "broken".
//
// Usage:  node scripts/probe-resolve-dayid-latency.mjs
//         node scripts/probe-resolve-dayid-latency.mjs --self-test

import { writeFileSync, mkdirSync } from 'node:fs'

const BASE = process.env.RELAY_BASE || 'https://field-relay-nba.jeffunglesbee.workers.dev'

// Read from the client, not chosen here. index.html gives resolve-dayid 15000ms
// (the claim's own derivedFrom records the read). A probe that invents its own
// budget is comparing against nothing.
const CLIENT_BUDGET_MS = 15000

// Long enough to turn "exceeds 20s" into a number. 120s is the cap, not an
// expectation -- a route that needs two minutes has a different problem than
// one that needs sixteen seconds, and both are worth knowing exactly.
const CAP_MS = 120000

/** Same season convention the client and the relay both use: Jul-Dec starts it. */
export const seasonFromDate = (y, m) => (m >= 7 ? `${y}-${y + 1}` : `${y - 1}-${y}`)

/**
 * The verdict for one timed call. Pure, so the three states can be asserted
 * without touching the network.
 *
 * `cached` WINS OVER a fast time. A 300ms response on a warm date is not
 * evidence about the cold path, and recording it as "fits the budget" is how
 * the original probe's 2/6 successes would have read as a refutation.
 */
export const verdictFor = ({ cached, ms, timedOut }) => {
  if (timedOut) return 'over-cap'
  if (cached) return 'cached'
  return ms <= CLIENT_BUDGET_MS ? 'fits-client-budget' : 'exceeds-client-budget'
}

if (process.argv.includes('--self-test')) {
  let pass = 0, fail = 0
  const t = (name, got, want, note = '') => {
    const ok = got === want
    ok ? pass++ : fail++
    console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok || !note ? '' : `\n      → ${note}`}`)
  }
  t('an uncached call inside the budget refutes the claim',
    verdictFor({ cached: false, ms: 900, timedOut: false }), 'fits-client-budget')
  t('an uncached call over the budget supports it',
    verdictFor({ cached: false, ms: 41000, timedOut: false }), 'exceeds-client-budget')
  t('A FAST CACHED CALL IS NOT EVIDENCE ABOUT THE COLD PATH',
    verdictFor({ cached: true, ms: 300, timedOut: false }), 'cached',
    'the original probe got 2/6 warm; reading those as "fits" would refute the claim on nothing')
  t('still running at the cap is a lower bound, not a measurement',
    verdictFor({ cached: false, ms: CAP_MS, timedOut: true }), 'over-cap')
  t('a timeout on a cached date is still over-cap, not cached',
    verdictFor({ cached: true, ms: CAP_MS, timedOut: true }), 'over-cap')
  t('the boundary is inclusive of the budget',
    verdictFor({ cached: false, ms: CLIENT_BUDGET_MS, timedOut: false }), 'fits-client-budget')
  t('one millisecond over is over',
    verdictFor({ cached: false, ms: CLIENT_BUDGET_MS + 1, timedOut: false }), 'exceeds-client-budget')
  t('the season convention matches the client (Jul starts the season)',
    seasonFromDate(2026, 8), '2026-2027')
  t('...and January belongs to the previous one', seasonFromDate(2026, 1), '2025-2026')
  console.log(`\n${pass}/${pass + fail} checks passed`)
  process.exit(fail ? 1 : 0)
}

mkdirSync('outbox', { recursive: true })
const stamp = new Date().toISOString().replace(/[:.]/g, '-')
const outPath = `outbox/resolve-dayid-latency-${stamp}.txt`
const out = []
const log = s => { out.push(s); console.log(s); try { writeFileSync(outPath, out.join('\n')) } catch {} }

// Dates chosen to be COLD. The four the earlier probe timed out on, plus two
// far-out matchdays nothing would have warmed. 2026-05-09 is kept as the warm
// control -- if even that one is cold now, the cache emptied and every row
// below is measuring a different thing than the claim describes.
const DATES = [
  '2026-08-28', '2026-08-29', '2026-08-30', '2026-09-12',
  '2026-10-24', '2026-11-07',
  '2026-05-09',
]

log(`probe_at: ${new Date().toISOString()}`)
log(`purpose: measure the UNCACHED resolve-dayid completion time in ms.`)
log(`client budget: ${CLIENT_BUDGET_MS}ms   probe cap: ${CAP_MS}ms`)
log('')
log('date         season      ms      cached  http  verdict')

const rows = []
for (const date of DATES) {
  const [y, m] = date.split('-').map(Number)
  const season = seasonFromDate(y, m)
  const t0 = Date.now()
  let ms = null, cached = null, http = null, timedOut = false, err = null
  try {
    const r = await fetch(`${BASE}/bundesliga-bapi/resolve-dayid?season=${season}&date=${date}`,
      { signal: AbortSignal.timeout(CAP_MS) })
    ms = Date.now() - t0
    http = r.status
    const body = await r.json().catch(() => ({}))
    cached = body?.cached ?? null
  } catch (e) {
    ms = Date.now() - t0
    timedOut = /timeout|abort/i.test(String(e))
    err = String(e).slice(0, 80)
  }
  const verdict = verdictFor({ cached, ms, timedOut })
  rows.push({ date, season, ms, cached, http, verdict })
  log(`${date}   ${season}   ${String(ms).padStart(6)}   ${String(cached).padEnd(6)}  ${String(http ?? '-').padEnd(4)}  ${verdict}${err ? `  (${err})` : ''}`)
}

log('')
const cold = rows.filter(r => r.verdict !== 'cached')
const measured = cold.filter(r => r.verdict !== 'over-cap')
log(`${rows.length} date(s): ${rows.length - cold.length} cached, ${measured.length} cold and measured, ${cold.length - measured.length} still running at ${CAP_MS}ms`)

if (!cold.length) {
  log('')
  log('NOT OBSERVABLE — every date was already warm, so the cold path was never')
  log('exercised. This is not a refutation and not a confirmation.')
} else if (!measured.length) {
  log('')
  log(`LOWER BOUND ONLY — every cold date was still running at ${CAP_MS}ms. The claim`)
  log(`stands and its open question ("21s or 90s?") is now ">${CAP_MS}ms", which is`)
  log('a stronger statement than the 20s it was derived from, not an answer.')
} else {
  const worst = Math.max(...measured.map(r => r.ms))
  const best = Math.min(...measured.map(r => r.ms))
  log('')
  log(`COLD LATENCY MEASURED: ${best}ms to ${worst}ms across ${measured.length} date(s).`)
  const fits = measured.filter(r => r.verdict === 'fits-client-budget')
  if (fits.length) {
    log(`${fits.length} of them completed INSIDE the client's ${CLIENT_BUDGET_MS}ms budget`)
    log(`(${fits.map(r => `${r.date} ${r.ms}ms`).join(', ')}).`)
    log('The claim says an uncached date "cannot complete in the client either".')
    log('That is REFUTED for these dates.')
  } else {
    log(`All ${measured.length} exceeded the client's ${CLIENT_BUDGET_MS}ms budget. The claim holds,`)
    log('and the fix question is now answerable: raising the client timeout to')
    log(`above ${worst}ms would let the cold path complete.`)
  }
}
log('')
log(`artifact: ${outPath}`)
