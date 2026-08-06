#!/usr/bin/env node
// OFFLINE correctness guard for the anomaly analysis. No relay, no network.
//
// WHY THIS EXISTS AND WHY IT IS NOT A PROBE. The real-corpus probe is
// CONFIRMATORY: it runs the shipped code and reports what that code says. If
// quantile() had an off-by-one, the probe would report a wrong p90 with total
// confidence and the run would read as a pass. Real data executes arithmetic;
// it does not validate it.
//
// These checks need no ground truth and no external data, because they test
// properties that must hold for ANY input:
//
//   A. DEFINITIONAL SELF-CONSISTENCY. `rare-high` is DEFINED as peak >= p90, so
//      its firing rate is predictable from the distribution itself -- exactly
//      1 - (count strictly below p90)/n, ties included. That is an equality
//      with a known answer, derived from the definition. It is the one place in
//      this feature where ground truth is free.
//   B. METAMORPHIC RELATIONS. Order-independence, monotonicity, duplication
//      invariance, ordering of p10<=median<=p90. These catch internally
//      consistent code computing the wrong number -- the bug class neither
//      static types nor schema validation can reach.
//   C. LEAVE-ONE-OUT correctness, checked against a brute-force recomputation.
//   D. THRESHOLD COHERENCE: a sport with k distinct values cannot express finer
//      than 1/k percentile resolution, so MIN_DISTINCT_FOR_PERCENTILE must be
//      consistent with the precision the UI implies.
//
// Deterministic by construction: a seeded PRNG, never Math.random, so a failure
// is reproducible rather than a flaky CI annoyance.

import { mkdirSync } from 'node:fs'
import { build } from 'esbuild'

mkdirSync('.probe-tmp', { recursive: true })
await build({
  entryPoints: ['scripts/data/anomaly-entry.js'],
  bundle: true, format: 'esm', platform: 'node',
  outfile: '.probe-tmp/anomaly-invariants.mjs',
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
const M = await import('../.probe-tmp/anomaly-invariants.mjs')

// mulberry32 -- small, deterministic, well-distributed. Seeded so any failure
// reproduces exactly.
function rng(seed) {
  return function () {
    seed |= 0; seed = (seed + 0x6D2B79F5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

let failures = 0
const fail = (name, detail) => { failures++; console.error(`  FAIL  ${name}\n        ${detail}`) }
const pass = (name, detail = '') => console.log(`  ok    ${name}${detail ? '  -- ' + detail : ''}`)

// Synthetic corpus with a controllable number of distinct values, so the
// distribution path can be exercised at resolutions the dev mock never reaches.
function makeCorpus({ n, distinct, sport = 'mlb', seed = 1, arcs = true }) {
  const r = rng(seed)
  const games = []
  for (let i = 0; i < n; i++) {
    const peak = Math.round((r() ** 1.6) * (distinct - 1)) * Math.floor(100 / distinct)
    const arc = []
    if (arcs) {
      let v = Math.max(0, peak - 30)
      for (let k = 0; k < 12; k++) { v = Math.max(0, Math.min(100, v + Math.round((r() - 0.45) * 18))); arc.push(v) }
      arc[6] = peak
    }
    games.push({
      id: `${sport}-g${i}`, sport, drama_peak: peak,
      drama_arc: arcs ? JSON.stringify(arc) : null,
      finalized_at: '2026-08-01T00:00:00Z',
      home: `H${i}`, away: `A${i}`, date: '2026-08-01',
    })
  }
  return games
}

console.log('anomaly invariants (offline, deterministic, no relay)\n')

// ---- A. DEFINITIONAL SELF-CONSISTENCY -------------------------------------
// rare-high fires iff peak >= p90. With ties at the boundary the exact expected
// count is computable, so this is an equality and not an approximation.
console.log('A. definitional self-consistency')
{
  const games = makeCorpus({ n: 400, distinct: 30, seed: 7 })
  const baselines = M.buildBaselines(games)
  const b = baselines.get('mlb')
  if (!b) fail('A0 baseline built', 'no mlb baseline')
  else if (b.resolution !== 'distribution') {
    fail('A0 resolution', `expected 'distribution' at 30 distinct/400 games, got '${b.resolution}'`)
  } else {
    pass('A0 distribution resolution reached', `n=${b.n} distinct=${b.distinct}`)

    const slate = M.describeSlate(games, baselines)
    const rows = slate.all.filter(r => r.status === 'ok')
    const fired = rows.filter(r => r.findings.some(f => f.id === 'rare-high')).length

    // Predicted independently of the module: for each game, LOO p90 over the
    // other games, then peak >= that. Brute force -- deliberately a different
    // implementation from the one under test.
    const peaks = games.map(g => g.drama_peak)
    let predicted = 0
    for (let i = 0; i < peaks.length; i++) {
      const others = peaks.filter((_, j) => j !== i).sort((x, y) => x - y)
      const idx = Math.min(others.length - 1, Math.max(0, Math.round(0.90 * (others.length - 1))))
      if (peaks[i] >= others[idx]) predicted++
    }
    if (fired !== predicted) fail('A1 rare-high rate == brute-force LOO prediction', `module fired ${fired}, brute force predicts ${predicted}`)
    else pass('A1 rare-high rate == brute-force LOO prediction', `${fired}/${rows.length} (${((fired / rows.length) * 100).toFixed(1)}%)`)

    const firedLow = rows.filter(r => r.findings.some(f => f.id === 'rare-low')).length
    let predictedLow = 0
    for (let i = 0; i < peaks.length; i++) {
      const others = peaks.filter((_, j) => j !== i).sort((x, y) => x - y)
      const idx = Math.min(others.length - 1, Math.max(0, Math.round(0.10 * (others.length - 1))))
      if (peaks[i] <= others[idx]) predictedLow++
    }
    if (firedLow !== predictedLow) fail('A2 rare-low rate == brute-force LOO prediction', `module fired ${firedLow}, brute force predicts ${predictedLow}`)
    else pass('A2 rare-low rate == brute-force LOO prediction', `${firedLow}/${rows.length}`)
  }
}

// ---- B. METAMORPHIC RELATIONS ---------------------------------------------
console.log('\nB. metamorphic relations')
{
  const games = makeCorpus({ n: 200, distinct: 25, seed: 11 })
  const b1 = M.buildBaselines(games).get('mlb')

  // B1 order-independence
  const r = rng(99)
  const shuffled = games.slice()
  for (let i = shuffled.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]] }
  const b2 = M.buildBaselines(shuffled).get('mlb')
  const same = ['n', 'distinct', 'p10', 'median', 'p90', 'medianRange', 'medianTurns'].every(k => b1[k] === b2[k])
  same ? pass('B1 order-independence') : fail('B1 order-independence', JSON.stringify({ b1, b2 }, (k, v) => (k === 'peaks' || k === 'keys' ? undefined : v)))

  // B2 quantile ordering
  ;(b1.p10 <= b1.median && b1.median <= b1.p90)
    ? pass('B2 p10 <= median <= p90', `${b1.p10} <= ${b1.median} <= ${b1.p90}`)
    : fail('B2 p10 <= median <= p90', `${b1.p10} / ${b1.median} / ${b1.p90}`)

  // B3 duplication invariance: distinct IDs, identical values -> same quantiles,
  // double n. Guards the dedupe path against changing the distribution.
  const doubled = games.concat(games.map(g => ({ ...g, id: g.id + '-copy' })))
  const b3 = M.buildBaselines(doubled).get('mlb')
  const quantilesHold = b3.p10 === b1.p10 && b3.median === b1.median && b3.p90 === b1.p90
  const nDoubled = b3.n === b1.n * 2
  ;(quantilesHold && nDoubled)
    ? pass('B3 duplication invariance', `n ${b1.n} -> ${b3.n}, quantiles unchanged`)
    : fail('B3 duplication invariance', `n=${b3.n} (expected ${b1.n * 2}); quantiles ${b3.p10}/${b3.median}/${b3.p90} vs ${b1.p10}/${b1.median}/${b1.p90}`)

  // B4 true dedupe: same IDs -> identical baseline
  const b4 = M.buildBaselines(games.concat(games)).get('mlb')
  b4.n === b1.n ? pass('B4 identical-id rows dedupe', `n stayed ${b4.n}`) : fail('B4 identical-id rows dedupe', `n=${b4.n}, expected ${b1.n}`)

  // B5 monotonicity: raising a game's peak cannot lower its percentile
  const baselines = M.buildBaselines(games)
  const target = games[3]
  const lo = M.describeAnomaly({ ...target, drama_peak: Math.max(0, target.drama_peak - 20) }, baselines)
  const hi = M.describeAnomaly({ ...target, drama_peak: Math.min(100, target.drama_peak + 20) }, baselines)
  ;(hi._percentile >= lo._percentile)
    ? pass('B5 percentile monotone in drama_peak', `${lo._percentile.toFixed(3)} -> ${hi._percentile.toFixed(3)}`)
    : fail('B5 percentile monotone in drama_peak', `${lo._percentile} -> ${hi._percentile}`)

  // B6 a game AT the median is neither rare-high nor rare-low
  const med = M.describeAnomaly({ ...games[0], id: 'probe-median', drama_peak: b1.median }, baselines)
  const bad = (med.findings || []).filter(f => f.id === 'rare-high' || f.id === 'rare-low')
  bad.length === 0 ? pass('B6 median game is neither rare-high nor rare-low') : fail('B6 median game is neither rare-high nor rare-low', bad.map(f => f.id).join(', '))
}

// ---- C. LEAVE-ONE-OUT CORRECTNESS -----------------------------------------
console.log('\nC. leave-one-out')
{
  const r = rng(23)
  const sorted = Array.from({ length: 61 }, () => Math.floor(r() * 40)).sort((a, b) => a - b)
  let mismatches = 0
  for (const p of [0.10, 0.50, 0.90]) {
    for (const v of new Set(sorted)) {
      const i = sorted.indexOf(v)
      const brute = sorted.filter((_, j) => j !== i)
      const expected = M.quantile(brute, p)
      const actual = M.looQuantile(sorted, p, v)
      if (expected !== actual) { mismatches++; if (mismatches <= 3) console.error(`        p=${p} v=${v}: loo=${actual} brute=${expected}`) }
    }
  }
  mismatches === 0 ? pass('C1 looQuantile == brute-force removal', `${new Set(sorted).size} distinct values x 3 quantiles`)
    : fail('C1 looQuantile == brute-force removal', `${mismatches} mismatches`)

  // C2 LOO must actually MOVE the answer on small n -- otherwise the fix is a no-op
  const small = makeCorpus({ n: 40, distinct: 22, sport: 'wnba', seed: 5 })
  const bl = M.buildBaselines(small)
  const b = bl.get('wnba')
  const extreme = small.reduce((a, g) => (g.drama_peak > a.drama_peak ? g : a))
  const looP90 = M.looQuantile(b.peaks, 0.90, extreme.drama_peak)
  looP90 <= b.p90
    ? pass('C2 LOO p90 <= in-sample p90 for the max game', `${looP90} <= ${b.p90}`)
    : fail('C2 LOO p90 <= in-sample p90 for the max game', `${looP90} > ${b.p90}`)

  // C3 does LOO actually CHANGE anything? C2 only proves it is safe (<=), which
  // a no-op also satisfies. If LOO never flips a finding at any realistic n,
  // the fix is cosmetic and this file should say so rather than let a green
  // check imply the bias was addressed. Measured across a range of n, since the
  // whole argument for LOO is that it matters most when the population is small.
  let flipTotal = 0
  const flipDetail = []
  for (const n of [30, 60, 120, 300]) {
    const corpus = makeCorpus({ n, distinct: 24, sport: 'mlb', seed: 100 + n })
    const bl = M.buildBaselines(corpus)
    const looFlagged = new Set(
      M.describeSlate(corpus, bl).flagged
        .filter(r => r.findings.some(f => f.id === 'rare-high'))
        .map(r => r.game.id))
    // In-sample comparison, computed here rather than by toggling module state.
    const base = bl.get('mlb')
    const inSample = new Set(corpus.filter(g => g.drama_peak >= base.p90).map(g => g.id))
    let flips = 0
    for (const id of new Set([...looFlagged, ...inSample])) {
      if (looFlagged.has(id) !== inSample.has(id)) flips++
    }
    flipTotal += flips
    flipDetail.push(`n=${n}: ${flips}`)
  }
  // INFORMATIONAL, deliberately not a failure. When this check was first
  // written it asserted flipTotal > 0 and FAILED -- LOO never flips a
  // rare-high finding at any tested n. That is a true and useful result, not a
  // bug: percentile findings only run at 'distribution' resolution, which
  // requires >= MIN_DISTINCT_FOR_PERCENTILE distinct values, and by the time a
  // sport has that many the population is large enough that removing one game
  // cannot move the quantile past the game's own value. The resolution gate
  // already excludes the self-referential bias LOO was added to fix.
  //
  // LOO stays because it is exact and free, and becomes load-bearing the moment
  // MIN_DISTINCT_FOR_PERCENTILE is lowered. This line reports whether it is
  // still inert so the next person doesn't inherit a comment claiming a
  // correction that isn't happening.
  console.log(`  info  C3 LOO flip count (rare-high) -- ${flipDetail.join(', ')}` +
    (flipTotal === 0
      ? '\n        currently INERT: the resolution gate already prevents the bias LOO corrects.'
      : '\n        LOO is actively changing outcomes.'))
}

// ---- D. THRESHOLD COHERENCE ------------------------------------------------
console.log('\nD. threshold coherence')
{
  // A sport with k distinct values cannot express percentile resolution finer
  // than 1/k. Claiming decile-level precision (p10/p90) therefore needs k >= 10.
  const k = M.MIN_DISTINCT_FOR_PERCENTILE
  k >= 10
    ? pass('D1 MIN_DISTINCT_FOR_PERCENTILE supports decile claims', `${k} >= 10 (p10/p90 need 1/10 resolution)`)
    : fail('D1 MIN_DISTINCT_FOR_PERCENTILE supports decile claims', `${k} < 10 -- the UI would imply finer precision than the data can express`)

  // Sanity: a sport below the threshold must NOT get distribution resolution.
  const coarse = makeCorpus({ n: 120, distinct: 7, sport: 'wnba', seed: 3 })
  const cb = M.buildBaselines(coarse).get('wnba')
  cb.resolution === 'tier'
    ? pass('D2 coarse sport routed to tier', `distinct=${cb.distinct} -> ${cb.resolution}`)
    : fail('D2 coarse sport routed to tier', `distinct=${cb.distinct} -> ${cb.resolution}`)

  // And a coarse sport must never emit a percentile-based finding.
  const cbl = M.buildBaselines(coarse)
  const anyPct = M.describeSlate(coarse, cbl).flagged
    .some(r => r.findings.some(f => f.id === 'rare-high' || f.id === 'rare-low'))
  !anyPct ? pass('D3 coarse sport emits no percentile findings')
    : fail('D3 coarse sport emits no percentile findings', 'rare-high/rare-low fired on a tier-resolution sport')
}

// ---- E. NO FINDING MAY DESCRIBE MOST OF THE POPULATION ---------------------
// The null-model probe measured 74.1% of real judged games flagged. Root cause
// was definitional: 'above-typical' tested peak > median, which HALF of any
// population satisfies. It has been replaced by 'tier-top'. This check exists
// so the same class of mistake cannot ship again unnoticed -- a condition that
// most games satisfy is a description, not a finding.
console.log('\nE. no finding describes most of the population')
{
  const MAX_RATE = 0.25
  for (const [name, corpus] of [
    ['tier sport (7 distinct)', makeCorpus({ n: 200, distinct: 7, sport: 'wnba', seed: 41 })],
    ['distribution sport (28 distinct)', makeCorpus({ n: 320, distinct: 28, sport: 'mlb', seed: 42 })],
  ]) {
    const bl = M.buildBaselines(corpus)
    const slate = M.describeSlate(corpus, bl)
    const judged = slate.all.filter(r => r.status === 'ok').length
    const per = new Map()
    for (const r of slate.flagged) for (const f of r.findings) per.set(f.id, (per.get(f.id) ?? 0) + 1)
    for (const [id, n] of [...per.entries()].sort((a, b) => b[1] - a[1])) {
      const rate = n / judged
      rate <= MAX_RATE
        ? pass(`E ${name}: ${id}`, `${n}/${judged} = ${(rate * 100).toFixed(1)}%`)
        : fail(`E ${name}: ${id} fires on most games`,
            `${n}/${judged} = ${(rate * 100).toFixed(1)}% exceeds ${MAX_RATE * 100}% -- this is a description of the population, not a finding`)
    }
    // The union matters too: individually-rare conditions can still flag
    // everything if there are enough of them.
    const anyRate = slate.flagged.length / judged
    anyRate <= 0.5
      ? pass(`E ${name}: union of all findings`, `${slate.flagged.length}/${judged} = ${(anyRate * 100).toFixed(1)}%`)
      : fail(`E ${name}: union of all findings flags most games`,
          `${slate.flagged.length}/${judged} = ${(anyRate * 100).toFixed(1)}% -- individually-rare conditions still add up to "almost everything"`)
  }
}

// ---- F. PERMUTATION TEST, OFFLINE ------------------------------------------
// The null-model probe needs the real corpus and therefore CI. GitHub Actions
// was degraded ("Failed to resolve action download info: Service Unavailable")
// for hours, so the fix for the 74.1% over-firing sat unverified against the
// question that found it.
//
// This closes that dependency the same way the rest of this file does: the
// result is driven by the SHAPE of the per-sport distributions, not by which
// specific games are in them. So the corpus here is calibrated to the real
// measured shapes -- mlb n=312/distinct=28, wnba n=73/distinct=7,
// mls n=51/distinct=7, fifa n=8/distinct=5 (2026-08-06 null-model run) -- and
// the same shuffle-the-labels test runs against it with no network at all.
//
// This is NOT a substitute for the real-corpus run and does not claim to be:
// real drama_peaks are not drawn from this generator. It answers the narrower
// question the fix raised -- does per-sport framing still collapse to the
// shuffled control once a definitionally-50% condition is removed? -- which is
// a question about structure, and structure is what is reproduced here.
console.log('\nF. permutation test (offline, calibrated to real per-sport shapes)')
{
  const REAL_SHAPES = [
    { sport: 'mlb', n: 312, distinct: 28 },
    { sport: 'wnba', n: 73, distinct: 7 },
    { sport: 'mls', n: 51, distinct: 7 },
    { sport: 'fifa world cup', n: 8, distinct: 5 },
  ]
  const corpus = REAL_SHAPES.flatMap((sh, i) => makeCorpus({ ...sh, seed: 900 + i }))

  const bl = M.buildBaselines(corpus)
  const slate = M.describeSlate(corpus, bl)
  const judged = slate.all.filter(r => r.status === 'ok').length
  const observed = slate.flagged.length
  const key = g => M.gameKey(g)
  const realSet = new Set(slate.flagged.map(r => key(r.game)))

  console.log(`  judged ${judged}; flagged ${observed} (${((observed / judged) * 100).toFixed(1)}%)`)

  const TRIALS = 50
  const labels = corpus.map(g => g.sport)
  const counts = [], overlaps = []
  for (let t = 0; t < TRIALS; t++) {
    const r = rng(7000 + t)
    const perm = labels.slice()
    for (let i = perm.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [perm[i], perm[j]] = [perm[j], perm[i]] }
    const sh = corpus.map((g, i) => ({ ...g, sport: perm[i] }))
    const f = M.describeSlate(sh, M.buildBaselines(sh)).flagged
    counts.push(f.length)
    const fs = new Set(f.map(r2 => key(r2.game)))
    let inter = 0
    for (const x of realSet) if (fs.has(x)) inter++
    overlaps.push(realSet.size + fs.size - inter === 0 ? 1 : inter / (realSet.size + fs.size - inter))
  }
  const mean = a => a.reduce((x, y) => x + y, 0) / a.length
  const meanOverlap = mean(overlaps)
  console.log(`  shuffled flagged: mean ${mean(counts).toFixed(1)};  observed ${observed}`)
  console.log(`  mean Jaccard(real, shuffled): ${meanOverlap.toFixed(3)}`)

  // The pre-fix run measured 74.1% flagged and 0.770 overlap. The bar here is
  // the over-firing, which is what the fix targeted and what is checkable
  // without the real corpus.
  const rate = observed / judged
  rate <= 0.5
    ? pass('F1 over-firing resolved', `${(rate * 100).toFixed(1)}% flagged, was 74.1% pre-fix`)
    : fail('F1 over-firing resolved', `${(rate * 100).toFixed(1)}% flagged -- still describes most of the population`)

  // Overlap is REPORTED, not asserted. Whether per-sport framing beats the
  // shuffled control is a question about real data, and a synthetic generator
  // cannot settle it. Recording the number keeps the question visible instead
  // of letting a green suite imply it was answered.
  console.log(`  info  F2 per-sport vs shuffled overlap = ${meanOverlap.toFixed(3)}` +
    (meanOverlap > 0.6
      ? '\n        still high on calibrated-synthetic data -- the real-corpus null model remains UNANSWERED and worth running.'
      : '\n        materially lower than the 0.770 measured pre-fix; the real-corpus run should confirm.'))
}

console.log('')
if (failures) { console.error(`${failures} invariant(s) FAILED`); process.exit(1) }
console.log('All anomaly invariants hold.')
