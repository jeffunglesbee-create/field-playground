// PERMUTATION TEST: does per-sport framing earn its complexity?
//
// AnomalyWatch's central claim is that a game is unusual FOR ITS OWN SPORT --
// that per-sport baselines find something a pooled one would not. That claim
// has never been tested; it was argued from the measured scale gap (MLB p90=83
// over 28 distinct values, WNBA p90=70 over 7) and then built on.
//
// This is the only check in the set that can come back and say DELETE THE
// FEATURE. The method is a standard null model: shuffle the sport labels across
// real games, preserving each sport's marginal count exactly, rebuild the
// baselines, and re-run the same shipped analysis. Under the null hypothesis
// ("sport identity carries no information about what is unusual"), the shuffled
// firing pattern should look like the real one. If it does, the per-sport
// machinery is describing the marginal distribution and the complexity is
// unearned.
//
// It also runs a POOLED baseline as a second control -- the simpler design that
// was rejected. If pooled and per-sport flag substantially the same games, the
// rejection was wrong.
//
// Runs the SHIPPED module via esbuild, not a re-implementation. Deterministic:
// a seeded PRNG, so a surprising result can be reproduced exactly.
//
// field-relay-nba is sandbox-blocked from chat -- CI-as-proxy.

import { mkdirSync, writeFileSync } from 'node:fs'
import { build } from 'esbuild'

mkdirSync('outbox', { recursive: true })
mkdirSync('.probe-tmp', { recursive: true })
const stamp = new Date().toISOString().replace(/[:.]/g, '-')
const outPath = 'outbox/anomaly-null-model-' + stamp + '.txt'
const out = []
const log = s => { out.push(s); console.log(s); try { writeFileSync(outPath, out.join('\n')) } catch {} }

await build({
  entryPoints: ['scripts/data/anomaly-entry.js'],
  bundle: true, format: 'esm', platform: 'node',
  outfile: '.probe-tmp/anomaly-null.mjs',
  external: ['solid-js', 'solid-js/web', 'solid-js/store'],
  loader: { '.jsx': 'jsx', '.css': 'empty' },
  define: { 'import.meta.env.DEV': 'false' },
  jsx: 'transform', jsxFactory: '__probeJsxNoop', jsxFragment: '__probeJsxNoop',
  banner: { js: 'const __probeJsxNoop = () => null;' },
  plugins: [{
    name: 'stub', setup(b) {
      b.onResolve({ filter: /(data\/relay|data\/outcomes|data\/safeResource|components\/Toast|components\/PickEm)$/ },
        a => ({ path: a.path, namespace: 'st' }))
      b.onLoad({ filter: /.*/, namespace: 'st' }, () => ({
        contents: 'module.exports = new Proxy({}, { get: () => () => undefined })', loader: 'js' }))
    },
  }],
  logLevel: 'silent',
})
const M = await import('../.probe-tmp/anomaly-null.mjs')

const UA = 'field-playground-probe/1.0 (github.com/jeffunglesbee-create/field-playground; research)'
const RELAY = 'https://field-relay-nba.jeffunglesbee.workers.dev'
const DAYS = Number(process.env.PROBE_DAYS || 30)
const TRIALS = Number(process.env.PROBE_TRIALS || 200)

function rng(seed) {
  return function () {
    seed |= 0; seed = (seed + 0x6D2B79F5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
function shiftDate(base, d) {
  const x = new Date(base + 'T00:00:00Z'); x.setUTCDate(x.getUTCDate() + d)
  return x.toISOString().split('T')[0]
}

function flaggedSet(games, baselines) {
  const s = new Set()
  for (const r of M.describeSlate(games, baselines).flagged) s.add(M.gameKey(r.game))
  return s
}
function jaccard(a, b) {
  if (!a.size && !b.size) return 1
  let inter = 0
  for (const x of a) if (b.has(x)) inter++
  return inter / (a.size + b.size - inter)
}

async function main() {
  const today = new Date().toISOString().split('T')[0]
  log('probe_at: ' + new Date().toISOString())
  log('purpose: permutation test -- does the per-sport framing find anything a shuffled-label')
  log('control does not? This is the one check that can conclude the feature is unearned.')
  log(`window: ${DAYS} days; permutation trials: ${TRIALS}`)
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
  log(`days OK: ${daysOk}/${DAYS};  real games: ${games.length}`)
  if (!daysOk) { log(''); log('=== VERDICT ==='); log('NO DATA. Every fetch failed -- this run answers nothing.'); return }
  log('')

  // ---- Observed: the real per-sport analysis ----
  const realBaselines = M.buildBaselines(games)
  const realFlagged = flaggedSet(games, realBaselines)
  const judged = M.describeSlate(games, realBaselines).all.filter(r => r.status === 'ok').length
  log('=== OBSERVED (real per-sport baselines) ===')
  log(`  judged: ${judged};  flagged: ${realFlagged.size}` + (judged ? `  (${((realFlagged.size / judged) * 100).toFixed(1)}%)` : ''))
  for (const b of [...realBaselines.values()].sort((x, y) => y.n - x.n)) {
    log(`    ${b.sport.padEnd(18)} n=${String(b.n).padStart(4)} distinct=${String(b.distinct).padStart(3)} ${b.resolution}`)
  }
  log('')

  // ---- Control 1: shuffled sport labels, marginals preserved ----
  log(`=== NULL MODEL: ${TRIALS} label permutations (marginal counts preserved) ===`)
  const labels = games.map(g => g.sport)
  const overlaps = [], counts = []
  for (let t = 0; t < TRIALS; t++) {
    const r = rng(1000 + t)
    const perm = labels.slice()
    for (let i = perm.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [perm[i], perm[j]] = [perm[j], perm[i]] }
    const shuffled = games.map((g, i) => ({ ...g, sport: perm[i] }))
    const bl = M.buildBaselines(shuffled)
    const f = flaggedSet(shuffled, bl)
    counts.push(f.size)
    overlaps.push(jaccard(realFlagged, f))
  }
  const mean = a => a.reduce((x, y) => x + y, 0) / a.length
  const sorted = counts.slice().sort((a, b) => a - b)
  const q = p => sorted[Math.min(sorted.length - 1, Math.max(0, Math.round(p * (sorted.length - 1))))]
  log(`  shuffled flagged count: mean ${mean(counts).toFixed(1)}, p5 ${q(0.05)}, median ${q(0.5)}, p95 ${q(0.95)}`)
  log(`  observed flagged count: ${realFlagged.size}`)
  // How often does a shuffle flag at least as many as reality?
  const atLeast = counts.filter(c => c >= realFlagged.size).length
  const pValue = (atLeast + 1) / (TRIALS + 1)
  log(`  permutation p-value (count >= observed): ${pValue.toFixed(4)}`)
  log(`  mean Jaccard overlap between real and shuffled flag sets: ${mean(overlaps).toFixed(3)}`)
  log('')

  // ---- Control 2: the rejected pooled design ----
  log('=== CONTROL: pooled baseline (the simpler design that was rejected) ===')
  const pooled = games.map(g => ({ ...g, sport: 'pooled' }))
  const pooledBl = M.buildBaselines(pooled)
  const pooledFlagged = new Set(
    [...flaggedSet(pooled, pooledBl)])
  const pb = pooledBl.get('pooled')
  log(`  pooled baseline: n=${pb?.n} distinct=${pb?.distinct} resolution=${pb?.resolution}`)
  log(`  pooled flagged: ${pooledFlagged.size};  per-sport flagged: ${realFlagged.size}`)
  log(`  Jaccard(per-sport, pooled): ${jaccard(realFlagged, pooledFlagged).toFixed(3)}`)
  const onlyPerSport = [...realFlagged].filter(k => !pooledFlagged.has(k)).length
  const onlyPooled = [...pooledFlagged].filter(k => !realFlagged.has(k)).length
  log(`  found ONLY by per-sport: ${onlyPerSport};  found ONLY by pooled: ${onlyPooled}`)
  log('')

  log('=== VERDICT ===')
  const overlapMean = mean(overlaps)
  if (pValue > 0.05 && overlapMean > 0.6) {
    log('THE PER-SPORT FRAMING IS NOT EARNING ITS COMPLEXITY on this corpus. Shuffled labels')
    log('flag a similar number of games and largely the SAME games. The feature would be')
    log('describing the marginal drama distribution, not sport-specific anomalies. Reconsider')
    log('before investing further.')
  } else if (overlapMean > 0.6) {
    log('MIXED. The flagged COUNT is distinguishable from the null, but shuffled labels still')
    log('select largely the same games -- so most of the signal is marginal, and the per-sport')
    log('structure is adding less than the design assumed.')
  } else {
    log('PER-SPORT FRAMING EARNS ITS PLACE. Shuffling sport labels selects a materially')
    log('different set of games, so sport identity carries real information about what counts')
    log('as unusual -- which is exactly the premise the design rests on.')
  }
  const jp = jaccard(realFlagged, pooledFlagged)
  log('')
  if (jp > 0.8) {
    log(`Separately: the pooled control flags nearly the same set (Jaccard ${jp.toFixed(3)}). The`)
    log('simpler rejected design would produce almost this output, so the per-sport machinery')
    log('is buying little on the CURRENT corpus even if it is theoretically sounder.')
  } else {
    log(`The pooled control diverges (Jaccard ${jp.toFixed(3)}), confirming the rejection of a`)
    log('pooled baseline was a real decision and not a stylistic one.')
  }
}

main().catch(e => log('FAILED: ' + String(e?.stack || e)))
