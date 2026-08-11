#!/usr/bin/env node
// Does PickEm's gameStatus() classify real games correctly?
//
// THE QUESTION. gameStatus decides 'pre' with `g.home_score === null`. That is
// a strict null check, and the measured schema for /context/date/ lists
// home_score as OPTIONAL at 39.6% fill for MLS -- which does not say whether
// the other 60% are present-and-null or absent entirely. The difference is
// load-bearing: `undefined === null` is false, so an ABSENT key falls past the
// 'pre' branch, past the finalized_at branch, and returns 'live'. Picking is
// disabled unless status is 'pre', so an unstarted game misclassified as live
// is a game nobody can pick.
//
// A schema fill rate cannot answer this -- it counts non-null, and absent and
// null both land in the same bucket. Only the raw records can. Same lesson as
// the CFL score at 100%: a fill rate says a field exists, never what its
// absence looks like.
//
// RUNS THE SHIPPED FUNCTION, not a copy. gameStatus is module-private inside
// the component, so this bundles PickEm with esbuild and re-exports it. A
// hand-copied version would keep agreeing with itself after the real one
// changed.

import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { build } from 'esbuild'

mkdirSync('outbox', { recursive: true })
const stamp = new Date().toISOString().replace(/[:.]/g, '-')
const outPath = 'outbox/gamestatus-over-real-slate-' + stamp + '.txt'
const out = []
const log = s => { out.push(s); console.log(s); try { writeFileSync(outPath, out.join('\n')) } catch {} }

const RELAY = 'https://field-relay-nba.jeffunglesbee.workers.dev'
const UA = 'field-playground-probe/1.0 (github.com/jeffunglesbee-create/field-playground; research)'

const dir = mkdtempSync(join(tmpdir(), 'gamestatus-'))
const outfile = join(dir, 'bundle.mjs')
const stub = {
  name: 'stub',
  setup(b) {
    b.onResolve({ filter: /\.module\.css$/ }, a => ({ path: a.path, namespace: 'stub' }))
    b.onResolve({ filter: /data\/relay$/ }, a => ({ path: a.path, namespace: 'stub' }))
    b.onResolve({ filter: /components\/Tabs$/ }, a => ({ path: a.path, namespace: 'stub' }))
    b.onLoad({ filter: /.*/, namespace: 'stub' }, () => ({
      contents: 'export const deskStore = { games: { regular: [], postseason: [] } };'
              + 'export const Tabs = () => null;'
              + 'export default new Proxy({}, { get: () => "" });',
      loader: 'js',
    }))
  },
}
await build({
  entryPoints: ['src/components/PickEm/index.jsx'],
  outfile, bundle: true, format: 'esm', platform: 'node', logLevel: 'silent',
  jsx: 'transform', jsxFactory: '__noop', jsxFragment: '__noop',
  banner: { js: 'const __noop = () => null; globalThis.localStorage ??= {getItem:()=>null,setItem:()=>{}};' },
  footer: { js: 'export { gameStatus as __gameStatus, pickStatus as __pickStatus };' },
  plugins: [stub],
})
const { __gameStatus: gameStatus } = await import(outfile)

function shiftDate(base, days) {
  const d = new Date(base + 'T00:00:00Z')
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

async function main() {
  log('probe_at: ' + new Date().toISOString())
  log('purpose: run the SHIPPED gameStatus() over real /context/date/ records and find')
  log('games it misclassifies -- specifically unstarted games it calls "live", which the')
  log('UI renders as unpickable.')
  log('')

  const today = new Date().toISOString().slice(0, 10)
  const dates = [0, -1, -2, -3, -4, -5, -6].map(d => shiftDate(today, d))

  const games = []
  let failures = 0
  for (const date of dates) {
    try {
      const res = await fetch(`${RELAY}/context/date/${date}`, { headers: { 'User-Agent': UA } })
      if (!res.ok) { failures++; log(`  ${date}: HTTP ${res.status}`); continue }
      const j = await res.json()
      const list = Array.isArray(j) ? j : (j.games ?? j.data ?? [])
      for (const g of list) games.push({ ...g, __date: date })
    } catch (e) { failures++; log(`  ${date}: ${String(e).slice(0, 80)}`) }
  }

  // Degraded-sample handling, the lesson from the schema --check run that
  // printed "No drift" over two 429s and a 68% sample.
  if (failures) log(`\n  ${failures} of ${dates.length} date fetches FAILED -- sample is degraded.`)
  if (!games.length) {
    log('\n=== NO DATA. Verdict withheld rather than reported as healthy. ===')
    rmSync(dir, { recursive: true, force: true })
    process.exitCode = 1
    return
  }
  log(`\ncollected ${games.length} real games across ${dates.length - failures} date(s)`)
  log('')

  // ---- the actual question: absent vs null ----
  log('=== IS home_score ABSENT OR NULL WHEN THERE IS NO SCORE? ===')
  let keyAbsent = 0, keyNull = 0, hasNumber = 0, other = 0
  for (const g of games) {
    if (!('home_score' in g)) keyAbsent++
    else if (g.home_score === null) keyNull++
    else if (typeof g.home_score === 'number') hasNumber++
    else other++
  }
  log(`  key absent entirely:      ${keyAbsent}`)
  log(`  key present, value null:  ${keyNull}`)
  log(`  numeric score:            ${hasNumber}`)
  log(`  other:                    ${other}`)
  log('')
  if (keyAbsent) {
    log('  *** KEY IS ABSENT on some records. `g.home_score === null` is FALSE for those,')
    log('  *** so they fall through to "live". This is a present-tense bug, not a latent one.')
  } else {
    log('  Key is always present. The strict null check happens to work on TODAY\'S data --')
    log('  it is still fragile, because it depends on the relay never omitting the field.')
  }
  log('')

  // ---- what the shipped function actually returns ----
  log('=== gameStatus() OVER REAL RECORDS ===')
  const dist = new Map()
  const suspects = []
  for (const g of games) {
    const s = gameStatus(g)
    dist.set(s, (dist.get(s) ?? 0) + 1)
    // A game with no numeric score and no finalized_at has not started. If
    // gameStatus says anything other than 'pre', picking is disabled on a
    // game that has not been played.
    const noScore = typeof g.home_score !== 'number'
    if (noScore && !g.finalized_at && s !== 'pre') suspects.push({ g, s })
  }
  for (const [s, n] of [...dist.entries()].sort((a, b) => b[1] - a[1])) {
    log(`  ${String(s).padEnd(10)} ${String(n).padStart(4)}`)
  }
  log('')
  log(`=== MISCLASSIFIED: unstarted games not reported as "pre": ${suspects.length} ===`)
  if (suspects.length) {
    log('  These render with BOTH pick buttons disabled, on games nobody has played.')
    for (const { g, s } of suspects.slice(0, 12)) {
      log(`    ${String(g.sport).padEnd(18)} ${g.__date}  ${String(g.away).slice(0,18).padEnd(18)} @ ${String(g.home).slice(0,18).padEnd(18)}`)
      log(`      gameStatus -> "${s}"   home_score=${JSON.stringify(g.home_score)}  finalized_at=${JSON.stringify(g.finalized_at ?? null)}`)
    }
    if (suspects.length > 12) log(`    ...and ${suspects.length - 12} more`)
  } else {
    log('  None on this sample. The bug is latent rather than active on current data.')
  }
  log('')

  // ---- the 0-vs-null trap, measured rather than argued ----
  log('=== THE 0-FOR-UNPLAYED TRAP (what CFL would introduce) ===')
  log('  /cfl/scoreboard/rounds writes 0 for all 47 unplayed fixtures. Simulating that')
  log('  shape against the shipped function:')
  const simulated = gameStatus({ home_score: 0, away_score: 0, finalized_at: null })
  log(`    gameStatus({home_score: 0, away_score: 0, finalized_at: null}) -> "${simulated}"`)
  log(`    ${simulated === 'pre' ? 'OK -- unpickable-game trap is closed.' : 'TRAP OPEN -- such a game is unpickable.'}`)
  log('')

  log('=== VERDICT ===')
  log('Read the misclassified count above. It is the only number here that says whether')
  log('this is a live defect or a hardening exercise.')

  rmSync(dir, { recursive: true, force: true })
}

await main()
