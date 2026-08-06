// Run AnomalyWatch's REAL analysis against the REAL uncensored corpus.
//
// WHY CI. The local dev mock returns a fixture slate carrying only 3 distinct
// drama_peak values for MLB, so a browser run proves the component renders and
// handles its states -- and proves nothing about the percentile path, which is
// the whole point of the feature. The real corpus carries 34 distinct values
// across 470 scored games. field-relay-nba is sandbox-blocked from chat, so
// this runs in CI, same as every other real-data probe here.
//
// It executes the SHIPPED module (bundled via esbuild from src/data), not a
// re-implementation. Testing a copy would only prove the copy agrees with
// itself -- the same discipline probe-golf-zero-leakage.mjs uses.
//
// What it checks, all against real data:
//   1. Does any sport actually reach 'distribution' resolution? If none does,
//      the percentile path is dead code in production and the feature is a
//      tier-only feature that should say so.
//   2. Do the named conditions actually fire on real games, and at what rate?
//      A condition that never fires is decoration; one that fires on nearly
//      every game is not an anomaly.
//   3. Are the excluded sports excluded for the stated reason?

import { mkdirSync, writeFileSync } from 'node:fs'
import { build } from 'esbuild'

mkdirSync('outbox', { recursive: true })
mkdirSync('.probe-tmp', { recursive: true })
const stamp = new Date().toISOString().replace(/[:.]/g, '-')
const outPath = 'outbox/anomaly-watch-real-corpus-' + stamp + '.txt'
const out = []
const log = s => { out.push(s); console.log(s); try { writeFileSync(outPath, out.join('\n')) } catch {} }

await build({
  entryPoints: ['scripts/data/anomaly-entry.js'],
  bundle: true, format: 'esm', platform: 'node',
  outfile: '.probe-tmp/anomaly-predicates.mjs',
  external: ['solid-js', 'solid-js/web', 'solid-js/store'],
  loader: { '.jsx': 'jsx', '.css': 'empty' },
  define: { 'import.meta.env.DEV': 'false' },
  jsx: 'transform', jsxFactory: '__probeJsxNoop', jsxFragment: '__probeJsxNoop',
  banner: { js: 'const __probeJsxNoop = () => null;' },
  plugins: [{
    name: 'stub-non-predicate-deps',
    setup(b) {
      b.onResolve({ filter: /(data\/relay|data\/outcomes|data\/safeResource|components\/Toast|components\/PickEm)$/ },
        args => ({ path: args.path, namespace: 'probe-stub' }))
      b.onLoad({ filter: /.*/, namespace: 'probe-stub' }, () => ({
        contents: 'module.exports = new Proxy({}, { get: () => () => undefined })', loader: 'js',
      }))
    },
  }],
  logLevel: 'silent',
})
const M = await import('../.probe-tmp/anomaly-predicates.mjs')

const UA = 'field-playground-probe/1.0 (github.com/jeffunglesbee-create/field-playground; research)'
const RELAY = 'https://field-relay-nba.jeffunglesbee.workers.dev'
const DAYS = Number(process.env.PROBE_DAYS || 30)

function shiftDate(base, d) {
  const x = new Date(base + 'T00:00:00Z'); x.setUTCDate(x.getUTCDate() + d)
  return x.toISOString().split('T')[0]
}

async function main() {
  const today = new Date().toISOString().split('T')[0]
  log('probe_at: ' + new Date().toISOString())
  log('purpose: exercise AnomalyWatch\'s SHIPPED analysis against the real uncensored corpus.')
  log('The dev mock carries 3 distinct drama_peak values; the real corpus carries ~34, so the')
  log('percentile path cannot be validated locally at all.')
  log(`window: ${DAYS} real days back from ${today}`)
  log('')

  const games = []
  let daysOk = 0
  for (let i = 0; i < DAYS; i++) {
    const d = shiftDate(today, -i)
    try {
      const res = await fetch(`${RELAY}/context/date/${d}`, { headers: { 'User-Agent': UA } })
      if (!res.ok) { log(`  ${d} FAILED HTTP ${res.status}`); await new Promise(r => setTimeout(r, 250)); continue }
      const j = await res.json()
      daysOk++
      games.push(...[...(j?.games?.regular ?? []), ...(j?.games?.postseason ?? [])].map(g => ({ ...g, _date: d })))
    } catch (e) { log(`  ${d} FAILED ${String(e?.message || e)}`) }
    await new Promise(r => setTimeout(r, 250))
  }
  log(`days fetched OK: ${daysOk} / ${DAYS};  real games: ${games.length}`)
  if (!daysOk) {
    log('')
    log('=== VERDICT ===')
    log('NO DATA. Every slate fetch failed. This run answers nothing -- not an all-clear.')
    return
  }
  log('')

  const baselines = M.buildBaselines(games)
  log('=== REAL PER-SPORT BASELINES (shipped buildBaselines) ===')
  log('  sport                  n  distinct  resolution     p10  median   p90  medRange  medTurns')
  let anyDistribution = false
  for (const b of [...baselines.values()].sort((x, y) => y.n - x.n)) {
    if (b.resolution === 'distribution') anyDistribution = true
    log(`  ${b.sport.padEnd(20)} ${String(b.n).padStart(4)} ${String(b.distinct).padStart(9)}  ${b.resolution.padEnd(13)} ${String(b.p10).padStart(4)} ${String(b.median).padStart(6)} ${String(b.p90).padStart(5)} ${String(b.medianRange).padStart(9)} ${String(b.medianTurns).padStart(9)}`)
  }
  const dup = [...baselines.values()][0]?.duplicatesDropped ?? 0
  log(`  duplicate rows dropped before building: ${dup}`)
  log('')

  log('=== EXCLUSION CHECK ===')
  const sportsSeen = new Set(games.map(g => M.normalizeSport(g.sport)).filter(Boolean))
  for (const s of [...sportsSeen].sort()) {
    if (M.isUnscoredSport(s)) log(`  "${s}" -> EXCLUDED (drama never computed for this sport)`)
    else if (!baselines.has(s)) log(`  "${s}" -> no baseline (no game carried a numeric drama_peak)`)
  }
  log('')

  // Most recent day with at least one finalized game -- what the component's
  // default "last completed slate" mode targets.
  const byDate = new Map()
  for (const g of games) {
    if (!byDate.has(g._date)) byDate.set(g._date, [])
    byDate.get(g._date).push(g)
  }
  const days = [...byDate.entries()].sort((a, b) => (a[0] < b[0] ? 1 : -1))
  const target = days.find(([, gs]) => gs.some(g => g.finalized_at))
  log('=== FINDING RATES ACROSS THE WHOLE REAL CORPUS ===')
  const slate = M.describeSlate(games, baselines)
  const counts = new Map()
  for (const r of slate.flagged) for (const f of r.findings) counts.set(f.id, (counts.get(f.id) ?? 0) + 1)
  const judged = slate.all.filter(r => r.status === 'ok').length
  log(`  games judged (status ok): ${judged} of ${slate.all.length}`)
  log(`  games with >=1 finding:   ${slate.flagged.length}` + (judged ? `  (${((slate.flagged.length / judged) * 100).toFixed(1)}%)` : ''))
  for (const id of ['rare-high', 'rare-low', 'above-typical', 'late-surge', 'fizzle', 'flat-tension', 'volatile']) {
    const n = counts.get(id) ?? 0
    const pct = judged ? ((n / judged) * 100).toFixed(1) : '0.0'
    log(`    ${id.padEnd(14)} ${String(n).padStart(4)}  (${pct}% of judged games)` + (n === 0 ? '   <- never fires on real data' : ''))
  }
  const statusCounts = new Map()
  for (const r of slate.all) statusCounts.set(r.status, (statusCounts.get(r.status) ?? 0) + 1)
  log('  status breakdown: ' + [...statusCounts.entries()].map(([k, v]) => `${k}=${v}`).join(', '))
  log('')

  if (target) {
    const [date, gs] = target
    const daySlate = M.describeSlate(gs, baselines)
    log(`=== WHAT THE COMPONENT WOULD SHOW for its default slate (${date}) ===`)
    log(`  games on slate: ${gs.length};  flagged: ${daySlate.flagged.length}`)
    for (const r of daySlate.flagged.slice(0, 10)) {
      log(`  ${r.game.away} @ ${r.game.home} (${r.sport})${r.isFinal ? '' : ' [in progress]'}`)
      for (const f of r.findings) log(`      ${f.label}: ${f.why}`)
    }
    log('')
  }

  log('=== VERDICT ===')
  if (!anyDistribution) {
    log('NO SPORT REACHES PERCENTILE RESOLUTION on real data. The percentile path is dead code')
    log('in production and the feature is tier-only -- which the UI should state outright rather')
    log('than implying a precision no sport supports.')
  } else {
    log('Percentile resolution is REAL for at least one sport -- the distribution path is live,')
    log('not theoretical, and the tier fallback is doing its job for the sports that need it.')
  }
  const dead = ['rare-high', 'rare-low', 'above-typical', 'late-surge', 'fizzle', 'flat-tension', 'volatile']
    .filter(id => (counts.get(id) ?? 0) === 0)
  if (dead.length) {
    log('')
    log('CONDITIONS THAT NEVER FIRE on this real corpus: ' + dead.join(', '))
    log('A condition that never fires is decoration, not a finding. Either its test is wrong,')
    log('or the corpus genuinely lacks that shape -- distinguish before shipping it as a feature.')
  }
  // DEFINITIONAL CHECK on real data. rare-high is DEFINED as peak >= LOO p90,
  // so its rate is predictable from the real distribution itself -- computed
  // here by brute force, a deliberately different implementation from the one
  // under test. A mismatch is a proof of a quantile bug, not a suspicion.
  log('')
  log('=== DEFINITIONAL SELF-CONSISTENCY on real data ===')
  for (const b of [...baselines.values()].filter(x => x.resolution === 'distribution')) {
    const peaks = b.peaks
    let predictedHigh = 0, predictedLow = 0
    for (let i = 0; i < peaks.length; i++) {
      const others = peaks.filter((_, j) => j !== i)
      const qi = p => others[Math.min(others.length - 1, Math.max(0, Math.round(p * (others.length - 1))))]
      if (peaks[i] >= qi(0.90)) predictedHigh++
      if (peaks[i] <= qi(0.10)) predictedLow++
    }
    const rows = slate.all.filter(r => r.status === 'ok' && r.sport === b.sport)
    const actualHigh = rows.filter(r => r.findings.some(f => f.id === 'rare-high')).length
    const actualLow = rows.filter(r => r.findings.some(f => f.id === 'rare-low')).length
    const okH = actualHigh === predictedHigh, okL = actualLow === predictedLow
    log(`  ${b.sport}: rare-high actual ${actualHigh} vs brute-force ${predictedHigh} ${okH ? 'MATCH' : '*** MISMATCH -- quantile bug ***'}`)
    log(`  ${b.sport}: rare-low  actual ${actualLow} vs brute-force ${predictedLow} ${okL ? 'MATCH' : '*** MISMATCH -- quantile bug ***'}`)
  }

  const overFiring = [...counts.entries()].filter(([, n]) => judged && n / judged > 0.5)
  if (overFiring.length) {
    log('')
    log('CONDITIONS FIRING ON >50% OF JUDGED GAMES: ' + overFiring.map(([id, n]) => `${id} (${n})`).join(', '))
    log('An "anomaly" that describes most games is not an anomaly. Worth tightening.')
  }
}

main().catch(e => log('FAILED: ' + String(e?.stack || e)))
