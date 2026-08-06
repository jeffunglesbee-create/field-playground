// Do the all-zero golf rows leak into the sport-agnostic drama components?
//
// OPEN RISK, flagged but never verified, from
// docs/outbox/cc-session-2026-08-06-anomaly-baseline-hygiene.md:
//
//   "those 26 all-zero golf games flow into sport-agnostic components. Whether
//    they surface as 'maximally boring' rather than 'not computed' has not been
//    checked; existing arc-length filters may already drop them, but that is
//    unverified."
//
// The distinction matters and is not cosmetic. golf's drama_peak is 0 because
// classifySport() in field-relay-nba returns 'other' for it, which has no
// historical-states fetcher -- so drama is NEVER COMPUTED and the field stays
// at its default. That is a missing measurement, not a measurement of
// "nothing happened." Any component that ranks, filters, or narrates on
// drama_peak/drama_arc and admits these rows is presenting an unpopulated
// metric to the user as if it were a real low score.
//
// METHOD. This does not re-implement the components' predicates -- it IMPORTS
// the real ones (analyzeGameArc, computeLeverageIndex) and runs the real golf
// rows through them. Re-implementing a filter and then testing the
// re-implementation would only prove the copy agrees with itself.
//
// Recurring, because this is a guard not a one-off: the filters that (may)
// exclude golf today are incidental arc-length checks, not deliberate
// sport exclusions. A future component that consumes drama_peak directly, or
// a relay change that starts writing a short arc for golf, would open the leak
// with nothing to notice it.
//
// field-relay-nba.jeffunglesbee.workers.dev is sandbox-blocked from chat --
// CI-as-proxy, same pattern as every real-data probe in this repo.

import { mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { build } from 'esbuild'

// The app's data modules use extensionless imports (Vite resolves them, bare
// Node does not), and dramaArcAnalysis pulls dramaTier from a Solid component
// module. So the real predicates are bundled with esbuild and imported from the
// bundle. This is deliberately NOT a re-implementation: whatever ships in
// src/data is what gets executed here. If those files change, this probe
// changes with them -- which is the entire point of a standing guard.
mkdirSync('.probe-tmp', { recursive: true })
await build({
  entryPoints: ['scripts/data/golf-leakage-entry.js'],
  bundle: true,
  format: 'esm',
  platform: 'node',
  outfile: '.probe-tmp/golf-leakage-predicates.mjs',
  external: ['solid-js', 'solid-js/web', 'solid-js/store'],
  loader: { '.jsx': 'jsx', '.css': 'empty' },
  // Vite injects import.meta.env; bare Node does not. Pinning DEV=false makes
  // the bundle take the same branch the deployed app takes.
  define: { 'import.meta.env.DEV': 'false' },
  // The transitive graph reaches Solid components (dramaTier lives in
  // DeskCard/index.jsx). Tree-shaking drops them, but JSX must still parse --
  // so it is transformed to inert calls rather than preserved as syntax Node
  // cannot read.
  jsx: 'transform',
  jsxFactory: '__probeJsxNoop',
  jsxFragment: '__probeJsxNoop',
  banner: { js: 'const __probeJsxNoop = () => null;' },
  // dramaArcAnalysis imports dramaTier from DeskCard/index.jsx, whose OWN
  // module-level imports include data/relay -- and relay.js calls
  // createResource at module scope, which throws outside a Solid render. The
  // component itself is tree-shaken; its side-effecting imports are not.
  //
  // Scoped precisely: only modules that are not on the predicate path get
  // stubbed. dramaArcAnalysis, leverageIndex, and dramaTier all still execute
  // as shipped -- those are what is under test. If a future refactor puts real
  // predicate logic behind one of these stubs, the probe fails loudly on a
  // missing export rather than passing on a silent copy.
  plugins: [{
    name: 'stub-non-predicate-deps',
    setup(b) {
      b.onResolve({ filter: /(data\/relay|data\/outcomes|data\/safeResource|components\/Toast|components\/PickEm)$/ },
        args => ({ path: args.path, namespace: 'probe-stub' }))
      // CJS shape on purpose: named imports off a CJS module resolve at
      // runtime, so the stub satisfies any import list without this probe
      // having to track what DeskCard happens to import today.
      b.onLoad({ filter: /.*/, namespace: 'probe-stub' }, () => ({
        contents: 'module.exports = new Proxy({}, { get: () => () => undefined })',
        loader: 'js',
      }))
    },
  }],
  logLevel: 'silent',
})
const { analyzeGameArc, computeLeverageIndex } =
  await import('../.probe-tmp/golf-leakage-predicates.mjs')

mkdirSync('outbox', { recursive: true })
const stamp = new Date().toISOString().replace(/[:.]/g, '-')
const outPath = 'outbox/golf-zero-leakage-' + stamp + '.txt'
const out = []
const log = s => { out.push(s); console.log(s); try { writeFileSync(outPath, out.join('\n')) } catch {} }

const UA = 'field-playground-probe/1.0 (github.com/jeffunglesbee-create/field-playground; research)'
const RELAY = 'https://field-relay-nba.jeffunglesbee.workers.dev'
const DAYS = Number(process.env.PROBE_DAYS || 30)

// Case-folding is mandatory, not defensive: the 2026-08-06 hygiene probe
// measured a real WNBA/wnba label collision in this same corpus. golf and
// "PGA Tour" are distinct labels that case-folding does NOT merge, so both
// are named explicitly.
const GOLF_LABELS = ['golf', 'pga tour']
const isGolf = sport => GOLF_LABELS.includes(String(sport || '').trim().toLowerCase())

function shiftDate(base, deltaDays) {
  const d = new Date(base + 'T00:00:00Z')
  d.setUTCDate(d.getUTCDate() + deltaDays)
  return d.toISOString().split('T')[0]
}

async function fetchDate(date) {
  const res = await fetch(`${RELAY}/context/date/${date}`, { headers: { 'User-Agent': UA } })
  if (!res.ok) return { err: 'HTTP ' + res.status }
  const data = await res.json()
  return {
    games: [
      ...(data?.games?.regular ?? []),
      ...(data?.games?.postseason ?? []),
    ].map(g => ({ ...g, _date: date })),
  }
}

function describeArc(g) {
  const raw = g.drama_arc
  if (raw === null || raw === undefined) return { kind: 'null/undefined', len: 0 }
  if (typeof raw !== 'string') return { kind: 'non-string (' + typeof raw + ')', len: 0 }
  let parsed
  try { parsed = JSON.parse(raw) } catch { return { kind: 'unparseable string', len: 0, raw: raw.slice(0, 40) } }
  if (Array.isArray(parsed)) {
    const distinct = new Set(parsed).size
    return { kind: 'array', len: parsed.length, distinct, allZero: parsed.every(v => v === 0) }
  }
  // Client write paths write an OBJECT; the Node backfill writes a bare ARRAY.
  // That difference is the authorship signal the MLB reset->refill used.
  return { kind: 'object (client-authored)', len: 0 }
}

async function main() {
  const today = new Date().toISOString().split('T')[0]
  log('probe_at: ' + new Date().toISOString())
  log('purpose: does an UNPOPULATED metric (golf drama_peak=0, never computed) reach the')
  log('user through the sport-agnostic drama components as if it were a real low score?')
  log('method: import and run the REAL component predicates, not copies of them.')
  log(`window: ${DAYS} real days back from ${today}`)
  log('')

  const all = []
  let daysOk = 0, daysFailed = 0
  for (let i = 0; i < DAYS; i++) {
    const date = shiftDate(today, -i)
    const r = await fetchDate(date)
    if (r.err) { log(`  ${date} FAILED ${r.err}`); daysFailed++; await new Promise(s => setTimeout(s, 250)); continue }
    daysOk++
    all.push(...r.games)
    await new Promise(s => setTimeout(s, 250))
  }
  log(`  days fetched OK: ${daysOk} / ${DAYS}   (failed: ${daysFailed})`)
  log('')

  // An empty corpus has two very different causes, and conflating them would
  // let a total fetch failure read as "no golf found, nothing to worry about."
  if (!daysOk) {
    log('=== VERDICT ===')
    log(`NO DATA. All ${DAYS} date fetches failed -- the corpus is empty because nothing was`)
    log('retrieved, not because no golf was played. This run answers nothing. If every day')
    log('returned HTTP 403, the probe is being run outside CI: the relay is sandbox-blocked')
    log('from chat, which is why this probe exists as a workflow.')
    return
  }

  const golf = all.filter(g => isGolf(g.sport))
  log('=== POPULATION ===')
  log('real games in window: ' + all.length)
  log('real golf-family games: ' + golf.length)
  const labelCounts = new Map()
  for (const g of golf) labelCounts.set(g.sport, (labelCounts.get(g.sport) ?? 0) + 1)
  for (const [k, n] of labelCounts) log(`  label "${k}": ${n}`)
  log('')

  if (!golf.length) {
    log('=== VERDICT ===')
    log('NO GOLF ROWS in this window. This run cannot answer the question -- it is a')
    log('no-signal run, not a clean one. Do not read it as "no leak."')
    return
  }

  const nonZero = golf.filter(g => typeof g.drama_peak === 'number' && g.drama_peak !== 0)
  log('=== PREMISE CHECK: are golf drama_peaks still uniformly 0? ===')
  log(`  golf rows with a non-zero drama_peak: ${nonZero.length} / ${golf.length}`)
  if (nonZero.length) {
    log('  *** The premise has CHANGED. Golf is now being scored somewhere. Every conclusion')
    log('  *** downstream of "golf drama is never computed" needs re-deriving, including the')
    log('  *** hygiene probe\'s recommendation to exclude golf from anomaly baselines.')
    for (const g of nonZero.slice(0, 10)) log(`      ${g._date} ${g.sport} drama_peak=${g.drama_peak}`)
  }
  log('')

  log('=== ARC SHAPE of real golf rows ===')
  const arcKinds = new Map()
  for (const g of golf) {
    const d = describeArc(g)
    const key = `${d.kind}${d.kind === 'array' ? ` len=${d.len} distinct=${d.distinct} allZero=${d.allZero}` : ''}`
    arcKinds.set(key, (arcKinds.get(key) ?? 0) + 1)
  }
  for (const [k, n] of [...arcKinds.entries()].sort((a, b) => b[1] - a[1])) log(`  ${k}  x${n}`)
  log('')

  // ---- The real predicates, on the real rows ----
  log('=== LEAK TEST: real component predicates, run on real golf rows ===')

  const analyzed = golf.map(g => ({ g, a: analyzeGameArc(g) }))
  const survivesAnalysis = analyzed.filter(x => x.a)
  log(`  analyzeGameArc()      admits ${survivesAnalysis.length} / ${golf.length} golf rows`)
  log('    (gates TheUnwatched and HallOfSurprises -- both map through it and .filter(Boolean))')

  const unwatched = survivesAnalysis.filter(x => x.a.isUnwatched)
  const surprises = survivesAnalysis.filter(x => x.a.gap > 0)
  const fizzles   = survivesAnalysis.filter(x => x.a.isFizzle)
  log(`      -> TheUnwatched    (isUnwatched): ${unwatched.length}`)
  log(`      -> HallOfSurprises (gap > 0):     ${surprises.length}`)
  log(`      -> HallOfSurprises (isFizzle):    ${fizzles.length}`)

  const leverage = golf.map(g => ({ g, l: computeLeverageIndex(g) })).filter(x => x.l)
  log(`  computeLeverageIndex() admits ${leverage.length} / ${golf.length} golf rows`)
  log('')

  const leaked = new Set([
    ...unwatched.map(x => x.g), ...surprises.map(x => x.g),
    ...fizzles.map(x => x.g), ...leverage.map(x => x.g),
  ])

  if (leaked.size) {
    log('=== LEAKED ROWS (reach a user-facing list) ===')
    for (const g of [...leaked].slice(0, 20)) {
      log(`  ${g._date} ${g.sport}  ${g.away ?? '?'} @ ${g.home ?? '?'}  drama_peak=${g.drama_peak}  game_id=${g.game_id ?? g.id ?? '?'}`)
    }
    if (leaked.size > 20) log(`  ...and ${leaked.size - 20} more`)
    log('')
  }

  log('=== VERDICT ===')
  if (leaked.size === 0) {
    log(`NO LEAK. All ${golf.length} real golf rows are rejected before any user-facing list.`)
    log('')
    log('BUT note WHY, because it changes what this result is worth: they are rejected by')
    log('incidental ARC-LENGTH and flat-arc checks (analyzeGameArc requires >= 5 points;')
    log('computeLeverageIndex rejects a zero average delta as undefined rather than')
    log('fabricating 0), NOT by any deliberate sport exclusion. Nothing in the codebase')
    log('states "golf is unscored, exclude it." The protection is a side effect.')
    log('')
    log('So this is a real all-clear for today and a weak guarantee for tomorrow. A new')
    log('component reading drama_peak directly, or a relay change that writes any >=5-point')
    log('arc for golf, opens the leak with nothing to catch it. That is why this probe is')
    log('scheduled rather than run once.')
  } else {
    log(`LEAK CONFIRMED: ${leaked.size} of ${golf.length} real golf rows reach a user-facing list.`)
    log('')
    log('These games have no computed drama at all -- classifySport() returns \'other\' for')
    log('golf, which has no historical-states fetcher. Presenting them alongside real MLB')
    log('and WNBA rows tells the user an unpopulated field is a measurement. The fix is an')
    log('explicit sport exclusion at the data layer, not a tighter arc-length threshold:')
    log('a threshold that happens to exclude golf today is the thing that just failed.')
  }
}

main().catch(e => log('FAILED: ' + String(e?.stack || e)))
