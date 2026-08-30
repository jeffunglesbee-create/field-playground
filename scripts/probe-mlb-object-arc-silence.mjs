// Why did MLB produce zero object-shape drama arcs in July and August?
//
// THE CLAIM THIS SETTLES
//
// `mlb-live-path-silence-unexplained` (MEASURED, 60%): "MLB is covered by
// SPORT_CRUNCH_RULES and in season, yet produced zero object arcs in July or
// August -- unexplained".
//
// Its original falsifier was "find any MLB object-shape arc, or confirm no MLB
// game was opened live in the app in those months". That second branch was
// retired on 2026-08-30: it assumed the object shape implies live viewing, and
// `object-arcs-are-live-browser-capture` resolved PARTIAL the same day.
// runDramaBackfillDiscovery writes the OBJECT shape for games THE RELAY
// nominates, once per app session, and _backfillOneDramaGame has an explicit
// MLB branch. So "nobody watched MLB" cannot explain the silence, and
// confirming it would have settled nothing.
//
// THREE CANDIDATE MECHANISMS, and they are distinguishable
//
//   STARVATION      GET /archive/drama-missing has NO sport filter, caps limit
//                   at 20 and orders by date DESC (relay src/index.js:11350-
//                   11361). If the twenty most recent drama-less rows are never
//                   MLB, the sweep is never offered an MLB game to reconstruct.
//
//   RECONSTRUCTION  fetchMLBHistoricalStates filters ESPN summary plays on
//                   `p.wallclock` and returns []. _backfillOneDramaGame exits
//                   on `if (!states.length) return` BEFORE any POST. Zero
//                   wallclock-carrying plays explains the silence outright, and
//                   would explain it even if starvation were solved.
//
//   NEITHER         MLB rows are offered AND the summary carries wallclock
//                   plays. Then the silence is still unexplained and this probe
//                   says so rather than picking a story.
//
// The arms are independent, so a run can implicate both. That is a real result
// and not a contradiction.
//
// Usage:  node scripts/probe-mlb-object-arc-silence.mjs
//         node scripts/probe-mlb-object-arc-silence.mjs --self-test

import { writeFileSync, mkdirSync } from 'node:fs'

const BASE = process.env.RELAY_BASE || 'https://field-relay-nba.jeffunglesbee.workers.dev'
const T = 25000

/**
 * The stored shape of one drama_arc cell.
 *
 * FOUR SHAPES, not two. The 120-day sweep recorded in `drama-arc-two-shapes`
 * found array, SQL null, the literal STRING "null", and object. A classifier
 * that folds the two nulls together would report the string one as an object
 * and manufacture exactly the rows this probe is looking for.
 */
export const arcShape = (raw) => {
  if (raw === null || raw === undefined) return 'sql-null'
  if (typeof raw !== 'string') return Array.isArray(raw) ? 'array' : 'object'
  const s = raw.trim()
  if (s === '' ) return 'sql-null'
  if (s === 'null') return 'string-null'
  let v
  try { v = JSON.parse(s) } catch { return 'unparseable' }
  if (v === null) return 'string-null'
  if (Array.isArray(v)) return 'array'
  return typeof v === 'object' ? 'object' : 'unparseable'
}

/**
 * What the three arms together say. Pure, so every branch is asserted without
 * a network.
 *
 * `null` inputs mean NOT OBSERVED, and never fold into a mechanism — an arm
 * that could not run is not an arm that came back negative.
 */
export const diagnosis = ({ mlbOffered, wallclockPlays, mlbObjectArcs }) => {
  if (mlbObjectArcs > 0) return 'refuted-object-arcs-exist'
  const starved = mlbOffered === null ? null : mlbOffered === 0
  const cannotReconstruct = wallclockPlays === null ? null : wallclockPlays === 0
  if (starved === null && cannotReconstruct === null) return 'not-observable'
  if (cannotReconstruct === true) return 'reconstruction-fails'
  if (starved === true) return 'starvation'
  if (starved === false && cannotReconstruct === false) return 'still-unexplained'
  return 'not-observable'
}

if (process.argv.includes('--self-test')) {
  let pass = 0, fail = 0
  const t = (name, got, want, note = '') => {
    const ok = got === want
    ok ? pass++ : fail++
    console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok || !note ? '' : `\n      → ${note}  (got ${got})`}`)
  }

  t('an array arc is an array', arcShape('[1,2,3]'), 'array')
  t('an object arc is an object', arcShape('{"peak":40,"samples":[]}'), 'object')
  t('THE STRING "null" IS NOT AN OBJECT', arcShape('null'), 'string-null',
    'the 120-day sweep found 8.9% of rows in this shape; folding it in would invent object rows')
  t('a SQL null is its own shape', arcShape(null), 'sql-null')
  t('an empty cell is a null, not unparseable', arcShape('   '), 'sql-null')
  t('garbage is unparseable, not an object', arcShape('{oops'), 'unparseable')
  t('a bare number is unparseable as an arc', arcShape('42'), 'unparseable')
  t('an already-parsed object is an object', arcShape({ peak: 1 }), 'object')

  t('finding an object arc refutes the claim outright',
    diagnosis({ mlbOffered: 0, wallclockPlays: 0, mlbObjectArcs: 3 }), 'refuted-object-arcs-exist')
  t('no wallclock plays implicates reconstruction',
    diagnosis({ mlbOffered: 5, wallclockPlays: 0, mlbObjectArcs: 0 }), 'reconstruction-fails')
  t('RECONSTRUCTION WINS OVER STARVATION when both hold',
    diagnosis({ mlbOffered: 0, wallclockPlays: 0, mlbObjectArcs: 0 }), 'reconstruction-fails',
    'a game that cannot be reconstructed stays silent even once it is offered')
  t('MLB never offered, but reconstructable, is starvation',
    diagnosis({ mlbOffered: 0, wallclockPlays: 120, mlbObjectArcs: 0 }), 'starvation')
  t('offered AND reconstructable leaves it unexplained',
    diagnosis({ mlbOffered: 5, wallclockPlays: 120, mlbObjectArcs: 0 }), 'still-unexplained')
  t('AN ARM THAT COULD NOT RUN IS NOT A NEGATIVE ARM',
    diagnosis({ mlbOffered: null, wallclockPlays: null, mlbObjectArcs: 0 }), 'not-observable',
    'null must never read as zero')
  t('one arm missing is still not observable when the other exonerates',
    diagnosis({ mlbOffered: 5, wallclockPlays: null, mlbObjectArcs: 0 }), 'not-observable')

  console.log(`\n${pass}/${pass + fail} checks passed`)
  process.exit(fail ? 1 : 0)
}

mkdirSync('outbox', { recursive: true })
const stamp = new Date().toISOString().replace(/[:.]/g, '-')
const outPath = `outbox/mlb-object-arc-silence-${stamp}.txt`
const out = []
const log = s => { out.push(s); console.log(s); try { writeFileSync(outPath, out.join('\n')) } catch {} }

const get = async (path) => {
  const r = await fetch(`${BASE}${path}`, { signal: AbortSignal.timeout(T) })
  if (!r.ok) throw new Error(`HTTP ${r.status}`)
  return r.json()
}

log(`probe_at: ${new Date().toISOString()}`)
log(`relay: ${BASE}`)
log('')

// ── ARM 1: is the sweep ever offered an MLB game? ───────────────────────────
log('=== ARM 1: /archive/drama-missing — what does the sweep get offered? ===')
let mlbOffered = null, mlbRows = []
try {
  const d = await get('/archive/drama-missing?limit=20')
  const games = d.games || []
  const bySport = {}
  for (const g of games) bySport[g.sport || '(none)'] = (bySport[g.sport || '(none)'] || 0) + 1
  mlbRows = games.filter(g => /mlb|baseball/i.test(g.sport || ''))
  mlbOffered = mlbRows.length
  log(`  ${games.length} row(s) returned (the route caps limit at 20, no sport filter, ORDER BY date DESC)`)
  log(`  by sport: ${JSON.stringify(bySport)}`)
  log(`  MLB rows offered: ${mlbOffered}`)
  if (games.length) log(`  date range: ${games[games.length - 1].date} .. ${games[0].date}`)
} catch (e) {
  log(`  FAILED: ${e.message} — arm not observed`)
}
log('')

// ── ARM 2: what shapes do MLB arcs actually have, against a control? ────────
log('=== ARM 2: /archive/drama/leaderboard — arc shapes, MLB vs a control ===')
let mlbObjectArcs = 0
for (const sport of ['MLB', 'NBA']) {
  try {
    const d = await get(`/archive/drama/leaderboard?sport=${sport}&limit=50`)
    const rows = d.games || d.leaderboard || d.results || []
    const counts = {}
    for (const r of rows) {
      const s = arcShape(r.drama_arc)
      counts[s] = (counts[s] || 0) + 1
    }
    if (sport === 'MLB') mlbObjectArcs = counts.object || 0
    log(`  ${sport.padEnd(4)} ${String(rows.length).padStart(3)} row(s)  ${JSON.stringify(counts)}`)
    // Dates per shape, because "MLB arcs are arrays" and "MLB arcs IN THE
    // CLAIM'S OWN WINDOW are arrays" are different statements, and only the
    // second one is about July and August 2026.
    const byShape = {}
    for (const r of rows) {
      const sh = arcShape(r.drama_arc)
      ;(byShape[sh] ||= []).push(r.date)
    }
    for (const [sh, dates] of Object.entries(byShape)) {
      const d = dates.filter(Boolean).sort()
      const julAug = d.filter(x => /^2026-0[78]/.test(x)).length
      log(`       ${sh.padEnd(11)} ${d.length} row(s)  ${d[0] ?? '?'} .. ${d[d.length - 1] ?? '?'}   ${julAug} in Jul/Aug 2026`)
    }
  } catch (e) {
    log(`  ${sport.padEnd(4)} FAILED: ${e.message}`)
    if (sport === 'MLB') mlbObjectArcs = 0
  }
}
log('  (NBA is the control: the 120-day sweep found its 7 object rows there, May-June.)')
log('')

// ── ARM 3: can an MLB game be reconstructed at all? ─────────────────────────
log('=== ARM 3: does the ESPN MLB summary carry wallclock plays? ===')
log('  fetchMLBHistoricalStates filters plays on p.wallclock and returns [];')
log('  _backfillOneDramaGame then exits on `if (!states.length) return` before any POST.')
let wallclockPlays = null, sampleSource = null, sampleId = null
try {
  let candidates = mlbRows.filter(g => g.espn_event_id)
  if (candidates.length) sampleSource = '/archive/drama-missing'
  if (!candidates.length) {
    // Fall back to a real past MLB slate. Not a fallback in the banned sense --
    // arm 3 asks whether ESPN carries the data, which does not depend on how
    // the event id was found, and saying "could not test" when one more call
    // would have tested it is the silence this repo keeps deleting.
    for (const back of [3, 5, 8, 12]) {
      const day = new Date(Date.now() - back * 86400000).toISOString().slice(0, 10)
      try {
        const ctx = await get(`/context/date/${day}`)
        const games = [...(ctx.games?.regular ?? []), ...(ctx.games?.postseason ?? [])]
        const mlb = games.filter(g => /mlb|baseball/i.test(g.sport || '') && g.espn_event_id)
        if (mlb.length) { candidates = mlb; sampleSource = `/context/date/${day}`; break }
      } catch { /* try the next day */ }
    }
  }
  if (!candidates.length) {
    log('  no MLB game with an espn_event_id found in either source — arm not observed')
  } else {
    sampleId = candidates[0].espn_event_id
    log(`  sample: event ${sampleId} (${candidates[0].away} @ ${candidates[0].home}, via ${sampleSource})`)
    const s = await get(`/espn-summary/sports/baseball/mlb/summary?event=${encodeURIComponent(String(sampleId))}`)
    const plays = Array.isArray(s.plays) ? s.plays : []
    wallclockPlays = plays.filter(p => p.wallclock).length
    log(`  plays returned: ${plays.length}   carrying wallclock: ${wallclockPlays}`)
    if (plays.length && !wallclockPlays) {
      const keys = Object.keys(plays[0] || {})
      log(`  first play's keys: ${keys.join(', ').slice(0, 200)}`)
    }
  }
} catch (e) {
  log(`  FAILED: ${e.message} — arm not observed`)
}
log('')

// ── verdict ────────────────────────────────────────────────────────────────
const verdict = diagnosis({ mlbOffered, wallclockPlays, mlbObjectArcs })
log(`inputs: mlbOffered=${mlbOffered} wallclockPlays=${wallclockPlays} mlbObjectArcs=${mlbObjectArcs}`)
log(`VERDICT: ${verdict}`)
log('')
const say = {
  'refuted-object-arcs-exist':
    'MLB object arcs DO exist. The claim\'s premise is false and it is REFUTED.',
  'reconstruction-fails':
    'The ESPN MLB summary carries no wallclock-bearing plays, so fetchMLBHistoricalStates\n' +
    'returns [] and _backfillOneDramaGame exits before writing. The silence is EXPLAINED,\n' +
    'and it is a data-shape problem in the summary, not a viewing-habits one.',
  'starvation':
    'MLB games can be reconstructed but /archive/drama-missing never offers one — its\n' +
    'twenty-row, date-DESC, sport-agnostic window is filled by other sports. The silence\n' +
    'is EXPLAINED as starvation, and the fix is a sport-aware or deeper window.',
  'still-unexplained':
    'MLB rows ARE offered and the summary DOES carry wallclock plays, so neither candidate\n' +
    'mechanism holds. The claim stands at 60% and its next falsifier is elsewhere.',
  'not-observable':
    'NOT OBSERVABLE — at least one arm could not run, and an arm that did not run is not\n' +
    'an arm that came back negative. This is neither a confirmation nor a refutation.',
}[verdict]
log(say)
log('')
log(`artifact: ${outPath}`)
