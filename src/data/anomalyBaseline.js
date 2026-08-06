// Statistical-anomaly detection against REAL per-sport baselines.
//
// WHY THIS MODULE EXISTS, AND WHY IT DOESN'T USE THE ENDPOINT EVERY OTHER
// COMPONENT USES. Every drama component in this app reads
// `/archive/drama/leaderboard`, which is ranked AND truncated. Building a
// baseline from it would be a textbook censored sample -- and this repo has
// already been bitten by exactly that: the long-held belief that "drama_peak
// is too coarse to rank with" came from measuring a top-N slice where every
// row is near the maximum by construction. The 2026-08-06 viability probe
// measured the UNCENSORED slate (`/context/date/{date}`) and found 470 scored
// games carrying 34 distinct drama_peak values. The metric was never coarse;
// the sample was. So this module sweeps `/context/date/` and nothing else.
//
// EVERY RULE BELOW IS A MEASURED FINDING, NOT A PREFERENCE:
//
//   1. Case-fold sport labels. The real corpus contains "WNBA" (69 games) and
//      "wnba" (6) as separate labels for one sport. Bucketing without folding
//      silently splits a sport into two undersized, wrong buckets.
//
//   2. Per-sport baselines, never pooled. The real distributions are on
//      different scales (MLB p90=83 over 28 distinct values; WNBA p90=70 over
//      7). A pooled baseline misranks whole sports by scale mismatch.
//
//   3. Percentiles only where the distribution can support them. WNBA and the
//      soccer bucket carry ~7 distinct values each; a "percentile" there is a
//      coarse tier wearing false precision. Those sports get a tier, labelled
//      as a tier.
//
//   4. Exclude the golf family entirely. `classifySport()` in the relay
//      returns 'other' for golf, which has no historical-states fetcher, so
//      drama is NEVER COMPUTED and drama_peak stays 0. That is a missing
//      measurement, not a measurement of a boring game. All 26 real golf rows
//      measured 2026-08-06 carry a non-array drama_arc, confirming it.
//
// OUTPUT SHAPE: named boolean conditions, never a raw score. Callers get
// `findings[]` with ids and human labels. The percentile is computed and
// carried internally as `_percentile` (underscored to mark it as such) so the
// UI can order by it without displaying it. That is deliberate: FIELD's
// ADR-002 does not bind this repo (nothing here ships to production), but its
// PROHIBITED #3 -- "displaying '75' or '85% fire' to the user creates evidence
// of a system that determines and presents interest levels" -- is free to
// satisfy now and expensive to retrofit at graduation.

import { analyzeGameArc } from './dramaArcAnalysis'

// Sports whose drama is never computed at all. Excluded by SPORT, not by the
// value 0 -- an earlier probe verdict got this wrong by judging on played-state
// (golf rows have finalized_at set, so they look played) and had to be
// corrected from its own raw output.
export const UNSCORED_SPORTS = new Set(['golf', 'pga tour'])

// Below this many distinct real values, a percentile is false precision.
// 7 distinct (WNBA, soccer) is a tier; 28 (MLB) is a distribution.
export const MIN_DISTINCT_FOR_PERCENTILE = 15

// A sport needs a real population before any claim about "rare for this sport"
// means anything.
export const MIN_GAMES_FOR_BASELINE = 20

// Case-fold only. Deliberately does NOT merge labels that differ by more than
// case: "golf" vs "PGA Tour" are distinct strings for what may be one sport,
// and guessing they're the same is the kind of inference this repo's probes
// exist to avoid. Both are excluded anyway.
export function normalizeSport(sport) {
  return String(sport ?? '').trim().toLowerCase()
}

export function isUnscoredSport(sport) {
  return UNSCORED_SPORTS.has(normalizeSport(sport))
}

// Exact percentile rank: the share of the real population at or below this
// value. No interpolation, no curve fitting -- a count and a division.
function percentileRank(sorted, value) {
  let n = 0
  for (const v of sorted) { if (v <= value) n++; else break }
  return n / sorted.length
}

export function quantile(sorted, p) {
  if (!sorted.length) return null
  const i = Math.min(sorted.length - 1, Math.max(0, Math.round(p * (sorted.length - 1))))
  return sorted[i]
}

// First index holding `value` in a sorted array, or -1. Used to remove exactly
// one occurrence for the leave-one-out adjustment below.
function lowerBound(sorted, value) {
  let lo = 0, hi = sorted.length
  while (lo < hi) {
    const mid = (lo + hi) >> 1
    if (sorted[mid] < value) lo = mid + 1
    else hi = mid
  }
  return lo < sorted.length && sorted[lo] === value ? lo : -1
}

// LEAVE-ONE-OUT. A game judged against a baseline that INCLUDES ITSELF is
// graded on a curve it helped set: an extreme game inflates its own p90 and so
// becomes less likely to be flagged.
//
// HONEST STATUS, measured not assumed: this is currently INERT.
// scripts/check-anomaly-invariants.mjs C3 was written to assert LOO changes
// real outcomes, and it FAILED -- LOO never flips a rare-high finding at n =
// 30/60/120/300. The reason is structural: percentile findings only run at
// 'distribution' resolution, which needs >= MIN_DISTINCT_FOR_PERCENTILE
// distinct values, and any population that rich is large enough that dropping
// one game cannot move the quantile past that game's own value. The resolution
// gate already excludes the bias this was added to correct.
//
// It stays because it is exact, costs nothing, and becomes load-bearing the
// moment MIN_DISTINCT_FOR_PERCENTILE is lowered. C3 reports the flip count on
// every run so nobody inherits a claim that stopped being true.
//
// Exact, not approximate: the reduced array is `sorted` minus one occurrence of
// `value`, so the quantile index into a length n-1 array maps back by shifting
// past the removed slot. No re-sorting, no re-scanning.
export function looQuantile(sorted, p, removeValue) {
  const n = sorted.length
  if (n <= 1) return null
  const cut = lowerBound(sorted, removeValue)
  if (cut < 0) return quantile(sorted, p) // value not present -- nothing to remove
  const m = n - 1
  const idx = Math.min(m - 1, Math.max(0, Math.round(p * (m - 1))))
  return idx < cut ? sorted[idx] : sorted[idx + 1]
}

// Percentile rank of a value against the population EXCLUDING one instance of
// itself: (others at or below) / (others).
export function looPercentileRank(sorted, value) {
  const n = sorted.length
  if (n <= 1) return null
  let le = 0
  for (const v of sorted) { if (v <= value) le++; else break }
  return (le - 1) / (n - 1)
}

function parseArc(g) {
  try {
    const arc = JSON.parse(g.drama_arc)
    return Array.isArray(arc) && arc.length ? arc : null
  } catch { return null }
}

// How much the arc travels end to end, and how often it changes direction.
// Both are exact counts over real adjacent entries -- the same discipline
// leverageIndex.js uses. They are what make "high but flat" and "volatile"
// expressible as real comparisons rather than magic constants: a game's own
// range is compared against its own sport's median range.
function arcShape(arc) {
  let range = Math.max(...arc) - Math.min(...arc)
  let turns = 0
  let prevDir = 0
  for (let i = 1; i < arc.length; i++) {
    const d = Math.sign(arc[i] - arc[i - 1])
    if (d !== 0 && prevDir !== 0 && d !== prevDir) turns++
    if (d !== 0) prevDir = d
  }
  return { range, turns }
}

/**
 * Build per-sport baselines from a real multi-day corpus.
 * `games` is the flattened, uncensored slate across the window.
 */
// A game must count once. Found in the very first browser run: the dev mock
// returns the same slate for every date, so a 14-day sweep produced 14 copies
// of each game and the population read as 14x its real size while `distinct`
// stayed flat -- a baseline that looks well-populated and isn't. Real
// /context/date/ is date-scoped so duplicates shouldn't occur, but "shouldn't"
// is the assumption class this repo keeps getting burned by, and a population
// count is what every percentile below rests on.
// Keyed on the game's OWN identity, never on the date it was fetched under.
// `_date` (the fetch date) was the first attempt and is wrong by construction:
// the same game pulled from two dates gets two different fetch dates, so it
// would never dedupe. `g.date` is the game's own date and is safe to fall back
// on; real rows carry game_id or id and never reach the fallback.
export function gameKey(g) {
  return g.game_id ?? g.id ?? g.espn_event_id ??
    `${g.date ?? ''}|${g.home ?? ''}|${g.away ?? ''}`
}

export function buildBaselines(games) {
  const bySport = new Map()
  const seen = new Set()
  let duplicatesDropped = 0

  for (const g of games ?? []) {
    const key = gameKey(g)
    if (seen.has(key)) { duplicatesDropped++; continue }
    seen.add(key)

    const sport = normalizeSport(g.sport)
    if (!sport || isUnscoredSport(sport)) continue
    const peak = g.drama_peak
    if (typeof peak !== 'number' || !Number.isFinite(peak)) continue

    if (!bySport.has(sport)) bySport.set(sport, { peaks: [], ranges: [], turns: [], keys: new Set() })
    const b = bySport.get(sport)
    b.peaks.push(peak)
    // Membership is tracked so leave-one-out is applied only to games that
    // genuinely contributed to this baseline. Removing a value for a game that
    // never entered would delete a DIFFERENT game's contribution.
    b.keys.add(key)

    const arc = parseArc(g)
    if (arc && arc.length >= 3) {
      const { range, turns } = arcShape(arc)
      b.ranges.push(range)
      b.turns.push(turns)
    }
  }

  const out = new Map()
  for (const [sport, b] of bySport) {
    const peaks = b.peaks.slice().sort((x, y) => x - y)
    const ranges = b.ranges.slice().sort((x, y) => x - y)
    const turns = b.turns.slice().sort((x, y) => x - y)
    const distinct = new Set(peaks).size

    out.set(sport, {
      sport,
      n: peaks.length,
      distinct,
      // 'distribution' supports real percentiles; 'tier' does not and says so.
      resolution: peaks.length >= MIN_GAMES_FOR_BASELINE && distinct >= MIN_DISTINCT_FOR_PERCENTILE
        ? 'distribution'
        : 'tier',
      usable: peaks.length >= MIN_GAMES_FOR_BASELINE,
      peaks,
      p10: quantile(peaks, 0.10),
      median: quantile(peaks, 0.50),
      p90: quantile(peaks, 0.90),
      maxPeak: peaks.length ? peaks[peaks.length - 1] : null,
      medianRange: quantile(ranges, 0.50),
      medianTurns: quantile(turns, 0.50),
      arcSampleN: ranges.length,
      keys: b.keys,
      duplicatesDropped,
    })
  }
  return out
}

// Each finding is a NAMED CONDITION that is either true or false for a game.
// No weights, no summing, no composite. `why` states the real comparison that
// made it true, so a reader can check the claim rather than trust it.
const FINDING_DEFS = [
  {
    id: 'rare-high',
    label: 'Rare high',
    kind: 'distribution',
    needs: 'distribution',
    test: (ctx) => ctx.baseline.p90 != null && ctx.peak >= ctx.baseline.p90,
    why: (ctx) => `peaked at or above the level only the top tenth of real ${ctx.sportLabel} games in this window reached`,
  },
  {
    id: 'rare-low',
    label: 'Rare low',
    kind: 'distribution',
    needs: 'distribution',
    test: (ctx) => ctx.baseline.p10 != null && ctx.peak <= ctx.baseline.p10,
    why: (ctx) => `stayed at or below the level nine in ten real ${ctx.sportLabel} games cleared`,
  },
  {
    id: 'tier-top',
    label: 'Top tier',
    kind: 'distribution',
    // REPLACES 'above-typical' (peak > median), removed 2026-08-06 after the
    // null-model probe measured 74.1% of judged games flagged. The cause was
    // definitional, not incidental: "above the median" describes HALF of any
    // population, so on the three tier-resolution sports (132 real games) it
    // fired on ~60 games automatically and dominated the whole output. A
    // finding that half the population satisfies is not a finding.
    //
    // At tier resolution the honest rare claim is sitting at the sport's
    // highest OBSERVED drama value -- with ~7 distinct values that is a real
    // and uncommon statement, and it is expressible at the resolution the data
    // actually has, which is the whole reason the tier path exists.
    needs: 'tier',
    test: (ctx) => ctx.baseline.maxPeak != null && ctx.peak >= ctx.baseline.maxPeak,
    why: (ctx) => `reached the highest drama level any real ${ctx.sportLabel} game hit in this window (${ctx.baseline.distinct} distinct levels exist for this sport, so this is a tier, not a percentile)`,
  },
  {
    id: 'late-surge',
    kind: 'shape',
    label: 'Late surge',
    needs: 'arc',
    test: (ctx) => ctx.analysis?.isUnwatched === true,
    why: (ctx) => `opened cold and finished hot -- early peak ${ctx.analysis.earlyPeak}, real peak ${ctx.analysis.finalPeak}`,
  },
  {
    id: 'fizzle',
    kind: 'shape',
    label: 'Fizzled out',
    needs: 'arc',
    test: (ctx) => ctx.analysis?.isFizzle === true,
    why: (ctx) => `reached real drama then cooled before the end -- down ${ctx.analysis.fizzleGap} from its peak by the late window`,
  },
  {
    id: 'flat-tension',
    kind: 'shape',
    label: 'Flat tension',
    // High-ish but with less travel than its own sport's typical game: tense
    // throughout rather than one spike. Compared against the sport's own median
    // range, not a hardcoded number.
    needs: 'arc',
    test: (ctx) => ctx.baseline.medianRange != null && ctx.baseline.median != null &&
      ctx.shape != null && ctx.shape.range < ctx.baseline.medianRange && ctx.peak > ctx.baseline.median,
    why: (ctx) => `above-median drama with less swing than a typical ${ctx.sportLabel} game (moved ${ctx.shape.range} vs a median of ${ctx.baseline.medianRange})`,
  },
  {
    id: 'volatile',
    kind: 'shape',
    label: 'Volatile',
    needs: 'arc',
    test: (ctx) => ctx.baseline.medianTurns != null && ctx.shape != null &&
      ctx.baseline.medianTurns > 0 && ctx.shape.turns >= ctx.baseline.medianTurns * 2,
    why: (ctx) => `changed direction ${ctx.shape.turns} times, at least double the median ${ctx.baseline.medianTurns} for real ${ctx.sportLabel} games`,
  },
]

/**
 * Describe one real game against its own sport's real baseline.
 * Returns null when no honest claim can be made, with a stated reason.
 */
export function describeAnomaly(game, baselines, { requireFinal = false } = {}) {
  const sport = normalizeSport(game?.sport)
  if (!sport) return null

  if (isUnscoredSport(sport)) {
    return { game, sport, status: 'not-measured', findings: [],
      note: 'drama is never computed for this sport -- a missing measurement, not a quiet game' }
  }

  const baseline = baselines?.get(sport)
  if (!baseline || !baseline.usable) {
    return { game, sport, status: 'no-baseline', findings: [],
      note: `only ${baseline?.n ?? 0} real ${sport} games in this window -- too few to call anything unusual` }
  }

  const peak = game.drama_peak
  if (typeof peak !== 'number' || !Number.isFinite(peak)) {
    return { game, sport, status: 'unscored', findings: [],
      note: 'this game carries no drama_peak yet' }
  }

  // An in-progress game has a partial arc, so arc-SHAPE findings (late surge,
  // fizzle, flat, volatile) would be describing an unfinished story as if it
  // were finished. Distribution findings still hold -- "already past the p90 of
  // finished games" is a true statement about a live game.
  const isFinal = Boolean(game.finalized_at)
  const arc = parseArc(game)
  const analysis = arc ? analyzeGameArc(game) : null
  const shape = arc && arc.length >= 3 ? arcShape(arc) : null
  const arcUsable = Boolean(arc) && (isFinal || !requireFinal)

  // Leave-one-out, applied ONLY when this game genuinely contributed to the
  // baseline (membership tracked in buildBaselines). Judging a game against a
  // curve it helped set biases against flagging it, worst at the small-n sports.
  const inBaseline = baseline.keys?.has(gameKey(game)) === true
  const effBaseline = inBaseline
    ? {
        ...baseline,
        p10: looQuantile(baseline.peaks, 0.10, peak),
        median: looQuantile(baseline.peaks, 0.50, peak),
        p90: looQuantile(baseline.peaks, 0.90, peak),
        // maxPeak needs LOO too, and here it genuinely bites: without it, the
        // single highest game is compared against a maximum it set itself, so
        // `peak >= maxPeak` is trivially true for exactly one game per sport.
        maxPeak: (() => {
          const ps = baseline.peaks
          if (ps.length <= 1) return null
          const last = ps[ps.length - 1]
          return peak >= last ? ps[ps.length - 2] : last
        })(),
        n: baseline.n - 1,
      }
    : baseline

  const ctx = {
    game, peak, baseline: effBaseline, analysis, shape,
    sportLabel: sport,
  }

  const findings = []
  for (const def of FINDING_DEFS) {
    if (def.needs === 'distribution' && baseline.resolution !== 'distribution') continue
    if (def.needs === 'tier' && baseline.resolution !== 'tier') continue
    if (def.needs === 'arc' && (!arcUsable || !isFinal)) continue
    let hit = false
    try { hit = def.test(ctx) === true } catch { hit = false }
    if (hit) findings.push({ id: def.id, label: def.label, kind: def.kind ?? 'shape', why: def.why(ctx) })
  }

  return {
    game, sport, baseline: effBaseline, status: 'ok', isFinal, findings,
    arcPartial: Boolean(arc) && !isFinal,
    leaveOneOut: inBaseline,
    // Ordering only. Never rendered -- see the module header.
    _percentile: inBaseline
      ? looPercentileRank(baseline.peaks, peak)
      : percentileRank(baseline.peaks, peak),
  }
}

/** Describe a whole slate, most-unusual first. */
export function describeSlate(games, baselines, opts) {
  const rows = (games ?? []).map(g => describeAnomaly(g, baselines, opts)).filter(Boolean)
  const withFindings = rows.filter(r => r.findings.length)
  withFindings.sort((a, b) => {
    if (b.findings.length !== a.findings.length) return b.findings.length - a.findings.length
    return (b._percentile ?? 0) - (a._percentile ?? 0)
  })
  return { flagged: withFindings, all: rows }
}
