// Pre-build probe for statistical-anomaly surfacing. Everything this app
// currently calls an "insight" is really an EXTREMUM -- sorted[0] of
// tonight's list. A real anomaly needs a baseline distribution, a
// deviation measure, and an honest "nothing unusual tonight" null state.
// None of those exist yet, and none can be built without first knowing
// what real historical data the relay will actually serve.
//
// THE TRAP THIS PROBE EXISTS TO AVOID, stated before running it:
// the obvious baseline source is /archive/drama/leaderboard, but that
// endpoint is RANKED BY drama_peak and truncated to top-N -- a censored
// sample. Computing "normal" from the 50 most dramatic games makes normal
// look extreme and every real game look unremarkable. This repo has
// already been burned by this exact shape once (dramaArcAnalysis.js
// documents a biased single-sport/top-N-by-peak check that found nothing,
// corrected later by a proper multi-sport probe). So this probe reads
// /context/date/{date} instead -- the FULL slate for a real date, boring
// games included -- which is the only uncensored source available.
//
// FOUR REAL QUESTIONS, not just "does it return data":
//   A. DEPTH      -- how far back does /context/date/{date} return real games?
//   B. COVERAGE   -- what fraction of those real games carry a real numeric
//                    drama_peak (the field any baseline would score against)?
//   C. SHAPE      -- how many DISTINCT drama_peak values does a real
//                    multi-day corpus actually contain? This is make-or-break
//                    and is why this probe exists: drama_peak is already
//                    documented as coarse (dramaWpMovement.js: "every one of
//                    the top 8 real games ties at drama_peak=74 (1/8
//                    distinct)"). If that coarseness holds across a real
//                    uncensored corpus, percentile/z-scoring on drama_peak is
//                    DEAD ON ARRIVAL -- ties everywhere, no usable
//                    distribution -- and the honest answer is to use a
//                    different real signal, not to ship a fake percentile.
//   D. UNBIASED   -- do per-date game counts look like a real full slate
//                    (varying, plausible) rather than a fixed top-N?
//
// CI-AS-PROXY: field-relay-nba.jeffunglesbee.workers.dev is sandbox-blocked
// from chat -- same pattern as every prior probe this session.

import { mkdirSync, writeFileSync } from 'node:fs'

mkdirSync('outbox', { recursive: true })
const stamp = new Date().toISOString().replace(/[:.]/g, '-')
const outPath = 'outbox/anomaly-baseline-viability-probe-' + stamp + '.txt'
const out = []
const log = s => { out.push(s); console.log(s); try { writeFileSync(outPath, out.join('\n')) } catch {} }

const UA = 'field-playground-probe/1.0 (github.com/jeffunglesbee-create/field-playground; research)'
const RELAY_BASE = 'https://field-relay-nba.jeffunglesbee.workers.dev'

// Contiguous recent window (what a real baseline would actually use) plus
// deep spot-checks to find the real depth limit.
const CONTIGUOUS_DAYS = 30
const DEEP_OFFSETS = [45, 60, 90, 120, 180, 365]

function shiftDate(base, deltaDays) {
  const d = new Date(base + 'T00:00:00Z')
  d.setUTCDate(d.getUTCDate() + deltaDays)
  return d.toISOString().split('T')[0]
}

async function fetchDate(date) {
  const res = await fetch(`${RELAY_BASE}/context/date/${date}`, { headers: { 'User-Agent': UA } })
  if (!res.ok) return { err: 'HTTP ' + res.status }
  const data = await res.json()
  const games = [
    ...(data?.games?.regular ?? []),
    ...(data?.games?.postseason ?? []),
  ]
  const peaks = games
    .map(g => g?.drama_peak)
    .filter(v => typeof v === 'number' && Number.isFinite(v))
  return { total: games.length, peaks, sports: [...new Set(games.map(g => g?.sport).filter(Boolean))] }
}

function median(arr) {
  if (!arr.length) return null
  const s = [...arr].sort((a, b) => a - b)
  const m = Math.floor(s.length / 2)
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2
}

function percentile(sorted, p) {
  if (!sorted.length) return null
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.round((p / 100) * (sorted.length - 1))))
  return sorted[idx]
}

async function main() {
  const today = new Date().toISOString().split('T')[0]
  log('probe_at: ' + new Date().toISOString())
  log('purpose: can a REAL, uncensored baseline distribution be built from /context/date/{date},')
  log('and does drama_peak actually have enough real variance to support percentile scoring?')
  log('base date (today): ' + today)
  log('')

  log('=== A/B/D: CONTIGUOUS ' + CONTIGUOUS_DAYS + '-DAY WINDOW (what a real baseline would use) ===')
  const corpus = []
  let datesWithGames = 0
  for (let i = 0; i < CONTIGUOUS_DAYS; i++) {
    const date = shiftDate(today, -i)
    const r = await fetchDate(date)
    if (r.err) { log(`${date}  FAILED ${r.err}`); await new Promise(s => setTimeout(s, 250)); continue }
    if (r.total > 0) datesWithGames++
    corpus.push(...r.peaks)
    log(`${date}  games=${String(r.total).padStart(3)}  with_drama_peak=${String(r.peaks.length).padStart(3)}  sports=${r.sports.join('/') || '-'}`)
    await new Promise(s => setTimeout(s, 250))
  }

  log('')
  log('=== A: DEPTH SPOT-CHECKS (how far back does real data go?) ===')
  for (const off of DEEP_OFFSETS) {
    const date = shiftDate(today, -off)
    const r = await fetchDate(date)
    if (r.err) { log(`-${off}d  ${date}  FAILED ${r.err}`); await new Promise(s => setTimeout(s, 250)); continue }
    log(`-${off}d  ${date}  games=${String(r.total).padStart(3)}  with_drama_peak=${String(r.peaks.length).padStart(3)}  sports=${r.sports.join('/') || '-'}`)
    await new Promise(s => setTimeout(s, 250))
  }

  log('')
  log('=== C: DISTRIBUTION SHAPE OF drama_peak (the make-or-break question) ===')
  const sorted = [...corpus].sort((a, b) => a - b)
  const distinct = [...new Set(corpus)].sort((a, b) => a - b)
  log('total real games with a numeric drama_peak: ' + corpus.length)
  log('DISTINCT drama_peak values: ' + distinct.length)
  if (corpus.length) {
    log('min=' + sorted[0] + '  p25=' + percentile(sorted, 25) + '  median=' + median(corpus) +
        '  p75=' + percentile(sorted, 75) + '  p90=' + percentile(sorted, 90) + '  max=' + sorted[sorted.length - 1])
    log('')
    log('real histogram (value: count, most common first):')
    const counts = new Map()
    for (const v of corpus) counts.set(v, (counts.get(v) ?? 0) + 1)
    const ranked = [...counts.entries()].sort((a, b) => b[1] - a[1])
    for (const [val, n] of ranked.slice(0, 20)) {
      const pct = ((n / corpus.length) * 100).toFixed(1)
      log(`  ${String(val).padStart(5)}: ${String(n).padStart(4)}  (${pct}%)  ${'#'.repeat(Math.min(40, Math.round(n / corpus.length * 200)))}`)
    }
    if (ranked.length > 20) log(`  ... and ${ranked.length - 20} more distinct real values`)
    const topShare = ranked.length ? (ranked[0][1] / corpus.length) : 0
    log('')
    log('most common single value accounts for: ' + (topShare * 100).toFixed(1) + '% of all real games')
  }

  log('')
  log('=== VERDICT ===')
  if (!corpus.length) {
    log('NOT VIABLE: no real games with a numeric drama_peak returned across the whole window.')
    log('A baseline cannot be built from this endpoint -- report this, do not fall back to the')
    log('censored leaderboard endpoint, which is exactly the trap this probe exists to avoid.')
    return
  }
  const topShare = (() => {
    const counts = new Map()
    for (const v of corpus) counts.set(v, (counts.get(v) ?? 0) + 1)
    return Math.max(...counts.values()) / corpus.length
  })()

  log('depth: ' + datesWithGames + '/' + CONTIGUOUS_DAYS + ' contiguous real dates returned games.')
  log('corpus: ' + corpus.length + ' real games carrying a real drama_peak.')
  log('shape: ' + distinct.length + ' distinct real values; most common covers ' + (topShare * 100).toFixed(1) + '%.')
  log('')
  if (distinct.length >= 15 && topShare < 0.35 && corpus.length >= 100) {
    log('VIABLE: drama_peak has real, usable variance across an uncensored multi-day corpus.')
    log('Percentile/MAD-based anomaly scoring against this real baseline is safe to build,')
    log('including an honest "nothing above the Nth percentile tonight" null state.')
  } else if (corpus.length >= 100 && (distinct.length < 15 || topShare >= 0.35)) {
    log('PARTIALLY VIABLE -- and this is the real finding: the corpus is big enough, but')
    log('drama_peak is TOO COARSE to percentile-score honestly (see the histogram above --')
    log('this is the same coarseness dramaWpMovement.js already documented at 1/8 distinct).')
    log('Do NOT ship percentile ranks on drama_peak; they would be mostly ties dressed up as')
    log('precision. The real path is total_wp_movement (8/8 distinct on real Savant data,')
    log('MLB-only) as the anomaly signal, with drama_peak used only as a coarse tier label.')
  } else {
    log('NOT VIABLE AS-IS: corpus too small (' + corpus.length + ' real games) for a stable')
    log('baseline. Report the real number rather than building percentiles on thin data.')
  }
}

main().catch(e => log('FAILED: ' + String(e)))
