// Round 2 of the anomaly-baseline work. Round 1 (probe-anomaly-baseline-
// viability.mjs) confirmed a real, uncensored 30-day corpus of 470 real
// games with genuine drama_peak variance (34 distinct values, most common
// only 15.5%) -- and overturned this repo's own prior belief that
// drama_peak is hopelessly coarse (that 1/8-distinct figure came from
// sampling the TOP of a leaderboard, where everything clusters at the
// ceiling by construction).
//
// It also left three real questions explicitly unresolved, and percentiles
// must NOT be computed until they are -- all three would move the numbers:
//
//   Q1. CROSS-SPORT COMPARABILITY. The corpus spans MLB/MLS/WNBA/FIFA
//       World Cup/golf/PGA Tour/AFL/NHL. Is a golf drama_peak on the same
//       scale as an MLB one? If per-sport distributions differ materially,
//       a single pooled baseline is misleading -- a normal golf day could
//       read as an MLB-grade anomaly purely from scale mismatch -- and
//       per-sport baselines are the honest structure.
//
//   Q2. THE ZEROS. 6.8% of the corpus (32 real games) has drama_peak
//       exactly 0. Genuinely undramatic games, or unplayed/cancelled ones
//       that were never scored? If the latter, they are not real data
//       points and including them drags the entire low end of the
//       distribution down, inflating every percentile above it.
//
//   Q3. SPORT-LABEL NORMALIZATION (spotted in round 1's raw output, not
//       previously flagged). Round 1 printed `sports=MLS/MLB/WNBA/golf/wnba`
//       for 2026-08-02 -- both `WNBA` and `wnba` on the SAME date -- and
//       `golf` alongside `PGA Tour` on several dates. If those are distinct
//       real labels for the same real sport, per-sport baselines would
//       silently fragment into undersized, wrong buckets.
//
// CI-AS-PROXY: field-relay-nba.jeffunglesbee.workers.dev is sandbox-blocked
// from chat -- same pattern as every prior probe this session.

import { mkdirSync, writeFileSync } from 'node:fs'

mkdirSync('outbox', { recursive: true })
const stamp = new Date().toISOString().replace(/[:.]/g, '-')
const outPath = 'outbox/anomaly-baseline-hygiene-probe-' + stamp + '.txt'
const out = []
const log = s => { out.push(s); console.log(s); try { writeFileSync(outPath, out.join('\n')) } catch {} }

const UA = 'field-playground-probe/1.0 (github.com/jeffunglesbee-create/field-playground; research)'
const RELAY_BASE = 'https://field-relay-nba.jeffunglesbee.workers.dev'
const DAYS = 30

function shiftDate(base, deltaDays) {
  const d = new Date(base + 'T00:00:00Z')
  d.setUTCDate(d.getUTCDate() + deltaDays)
  return d.toISOString().split('T')[0]
}

async function fetchDate(date) {
  const res = await fetch(`${RELAY_BASE}/context/date/${date}`, { headers: { 'User-Agent': UA } })
  if (!res.ok) return { err: 'HTTP ' + res.status }
  const data = await res.json()
  return {
    games: [
      ...(data?.games?.regular ?? []),
      ...(data?.games?.postseason ?? []),
    ].map(g => ({ ...g, _date: date })),
  }
}

function stats(vals) {
  if (!vals.length) return null
  const s = [...vals].sort((a, b) => a - b)
  const at = p => s[Math.min(s.length - 1, Math.max(0, Math.round((p / 100) * (s.length - 1))))]
  return { n: s.length, distinct: new Set(s).size, min: s[0], p25: at(25), median: at(50), p75: at(75), p90: at(90), max: s[s.length - 1] }
}

// Classify a real game's played-state from the real fields this repo
// already relies on elsewhere (DeskCard's gameStatus uses exactly these).
function playedState(g) {
  const noScores = g.home_score == null && g.away_score == null
  if (g.finalized_at) return 'final'
  if (noScores) return 'unplayed(no scores)'
  return 'in-progress/unfinalized'
}

async function main() {
  const today = new Date().toISOString().split('T')[0]
  log('probe_at: ' + new Date().toISOString())
  log('purpose: resolve the 3 real hygiene questions blocking percentile computation --')
  log('cross-sport comparability, the drama_peak==0 population, and sport-label normalization.')
  log('base date: ' + today + ', window: ' + DAYS + ' real days')
  log('')

  const all = []
  for (let i = 0; i < DAYS; i++) {
    const date = shiftDate(today, -i)
    const r = await fetchDate(date)
    if (r.err) { log(`${date} FAILED ${r.err}`); await new Promise(s => setTimeout(s, 250)); continue }
    all.push(...r.games)
    await new Promise(s => setTimeout(s, 250))
  }
  const scored = all.filter(g => typeof g.drama_peak === 'number' && Number.isFinite(g.drama_peak))
  log('real games fetched: ' + all.length + ' | carrying a real numeric drama_peak: ' + scored.length)
  log('')

  // ---- Q3 first: label normalization decides how Q1 is even bucketed ----
  log('=== Q3: SPORT-LABEL NORMALIZATION ===')
  const rawLabels = new Map()
  for (const g of all) {
    const k = g.sport ?? '(missing)'
    rawLabels.set(k, (rawLabels.get(k) ?? 0) + 1)
  }
  log('every RAW sport label seen, with real game counts:')
  for (const [k, n] of [...rawLabels.entries()].sort((a, b) => b[1] - a[1])) {
    log(`  ${JSON.stringify(k).padEnd(22)} ${String(n).padStart(4)}`)
  }
  const collisions = new Map()
  for (const k of rawLabels.keys()) {
    const norm = String(k).toLowerCase().trim()
    if (!collisions.has(norm)) collisions.set(norm, [])
    collisions.get(norm).push(k)
  }
  const realCollisions = [...collisions.entries()].filter(([, v]) => v.length > 1)
  log('')
  log('case-insensitive collisions (same real sport under >1 label): ' + (realCollisions.length || 'none'))
  for (const [norm, variants] of realCollisions) log(`  "${norm}" <- ${variants.map(v => JSON.stringify(v)).join(' + ')}`)
  log('')
  log('NOTE: `golf` vs `PGA Tour` would NOT be caught by case-folding -- reported separately')
  log('below so a human decides whether they are the same real sport, rather than this script')
  log('guessing and silently merging two real, possibly-distinct populations.')
  const golfish = [...rawLabels.entries()].filter(([k]) => /golf|pga/i.test(String(k)))
  for (const [k, n] of golfish) log(`  golf-family label: ${JSON.stringify(k)} -> ${n} real games`)

  // ---- Q1: per-sport distributions (bucketed on case-folded label) ----
  log('')
  log('=== Q1: CROSS-SPORT COMPARABILITY (case-folded buckets) ===')
  const bySport = new Map()
  for (const g of scored) {
    const k = String(g.sport ?? '(missing)').toLowerCase().trim()
    if (!bySport.has(k)) bySport.set(k, [])
    bySport.get(k).push(g.drama_peak)
  }
  const rows = [...bySport.entries()].map(([k, vals]) => ({ sport: k, ...stats(vals) })).sort((a, b) => b.n - a.n)
  log('sport                    n  distinct  min  p25  med  p75  p90  max')
  for (const r of rows) {
    log(`${r.sport.padEnd(20)} ${String(r.n).padStart(4)}  ${String(r.distinct).padStart(8)}  ${String(r.min).padStart(3)}  ${String(r.p25).padStart(3)}  ${String(r.median).padStart(3)}  ${String(r.p75).padStart(3)}  ${String(r.p90).padStart(3)}  ${String(r.max).padStart(3)}`)
  }
  const sizable = rows.filter(r => r.n >= 20)
  const medians = sizable.map(r => r.median)
  const medianSpread = medians.length ? Math.max(...medians) - Math.min(...medians) : 0
  log('')
  log('sports with n>=20 (large enough to compare): ' + sizable.map(r => r.sport).join(', '))
  log('spread between their real medians: ' + medianSpread + ' points')

  // ---- Q2: the zeros ----
  log('')
  log('=== Q2: THE drama_peak == 0 POPULATION ===')
  const zeros = scored.filter(g => g.drama_peak === 0)
  const nonzero = scored.filter(g => g.drama_peak !== 0)
  log('real games with drama_peak exactly 0: ' + zeros.length + ' (' + ((zeros.length / scored.length) * 100).toFixed(1) + '% of scored)')
  const zeroStates = new Map()
  for (const g of zeros) {
    const st = playedState(g)
    zeroStates.set(st, (zeroStates.get(st) ?? 0) + 1)
  }
  log('')
  log('played-state breakdown of the ZERO population:')
  for (const [st, n] of [...zeroStates.entries()].sort((a, b) => b[1] - a[1])) {
    log(`  ${st.padEnd(26)} ${String(n).padStart(4)}  (${((n / (zeros.length || 1)) * 100).toFixed(1)}%)`)
  }
  const nzStates = new Map()
  for (const g of nonzero) {
    const st = playedState(g)
    nzStates.set(st, (nzStates.get(st) ?? 0) + 1)
  }
  log('')
  log('played-state breakdown of the NON-ZERO population (control group):')
  for (const [st, n] of [...nzStates.entries()].sort((a, b) => b[1] - a[1])) {
    log(`  ${st.padEnd(26)} ${String(n).padStart(4)}  (${((n / (nonzero.length || 1)) * 100).toFixed(1)}%)`)
  }
  log('')
  log('sample of up to 12 real zero-peak games (raw, for inspection):')
  for (const g of zeros.slice(0, 12)) {
    log(`  ${g._date}  ${String(g.sport).padEnd(16)} ${String(g.away ?? '?')} @ ${String(g.home ?? '?')}  scores=${g.away_score ?? 'null'}-${g.home_score ?? 'null'}  finalized=${g.finalized_at ? 'yes' : 'no'}`)
  }
  // CORRECTED 2026-08-06 -- the original verdict here judged the zeros purely
  // on played-state and concluded "KEEP THEM, 0 is a real low score." The raw
  // sample it printed immediately disproved that: 10 of 12 sampled zeros were
  // golf/PGA Tour, which are `finalized_at`-set (so they LOOK played to a
  // naive check) but whose drama is never computed at all -- classifySport()
  // in the relay's drama-backfill.mjs returns 'other' for golf, and 'other'
  // has no historical-states fetcher, so drama_peak stays 0 by default. A
  // sport whose ENTIRE scored population is exactly 0 has an unpopulated
  // metric, not a uniformly boring one. Judge by sport first, then state.
  const bySportZero = new Map()
  for (const g of scored) {
    const k = String(g.sport ?? '(missing)').toLowerCase().trim()
    if (!bySportZero.has(k)) bySportZero.set(k, { total: 0, zero: 0 })
    const e = bySportZero.get(k)
    e.total++
    if (g.drama_peak === 0) e.zero++
  }
  const unpopulatedSports = [...bySportZero.entries()]
    .filter(([, e]) => e.total >= 3 && e.zero === e.total)
    .map(([k]) => k)
  const zerosFromUnpopulated = zeros.filter(g => unpopulatedSports.includes(String(g.sport ?? '').toLowerCase().trim())).length
  const residualZeros = zeros.length - zerosFromUnpopulated

  log('')
  log('sports whose ENTIRE scored population is 0 (metric unpopulated, not undramatic):')
  log('  ' + (unpopulatedSports.length ? unpopulatedSports.join(', ') : '(none)'))
  log('zeros attributable to those sports: ' + zerosFromUnpopulated + ' of ' + zeros.length)
  log('residual zeros in sports that DO get scored: ' + residualZeros)

  const zeroUnplayed = (zeroStates.get('unplayed(no scores)') ?? 0)
  const zeroUnplayedShare = zeros.length ? zeroUnplayed / zeros.length : 0

  // ---- impact: what excluding bad zeros would do to the real percentiles ----
  log('')
  log('=== IMPACT ON REAL PERCENTILES ===')
  const withZeros = stats(scored.map(g => g.drama_peak))
  const withoutZeros = stats(nonzero.map(g => g.drama_peak))
  log('WITH zeros    : ' + JSON.stringify(withZeros))
  log('WITHOUT zeros : ' + JSON.stringify(withoutZeros))
  if (withZeros && withoutZeros) {
    log('median shift: ' + withZeros.median + ' -> ' + withoutZeros.median +
        '   p90 shift: ' + withZeros.p90 + ' -> ' + withoutZeros.p90)
  }

  log('')
  log('=== VERDICT ===')
  log('Q3 (labels): ' + (realCollisions.length
    ? 'REAL PROBLEM -- ' + realCollisions.length + ' case-collision(s) found; per-sport buckets MUST case-fold or they fragment.'
    : 'no case collisions found in this real window.'))
  log('Q1 (cross-sport): ' + (medianSpread >= 10
    ? 'PER-SPORT BASELINES REQUIRED -- real medians differ by ' + medianSpread + ' points across sports with n>=20. A pooled baseline would misrank whole sports by scale mismatch.'
    : 'pooled baseline defensible -- real medians differ by only ' + medianSpread + ' points across sports with n>=20, though per-sport remains the safer default.'))
  log('Q2 (zeros): ' + (zerosFromUnpopulated / (zeros.length || 1) >= 0.5
    ? 'EXCLUDE BY SPORT -- ' + zerosFromUnpopulated + ' of ' + zeros.length + ' zeros come from sports whose ENTIRE scored population is 0 (' +
      unpopulatedSports.join(', ') + '), i.e. the metric is never computed for them. Those are not real data points. ' +
      'The ' + residualZeros + ' residual zero(s) in scored sports need a separate judgement -- do NOT filter on the value 0 itself, filter on sport.'
    : 'zeros are NOT concentrated in unpopulated sports (' + zerosFromUnpopulated + '/' + zeros.length + '); ' +
      (zeroUnplayedShare > 0 ? (zeroUnplayedShare * 100).toFixed(1) + '% are unplayed -- exclude on played-state.' : 'they appear genuinely played, so 0 is a real low score.')))
}

main().catch(e => log('FAILED: ' + String(e)))
