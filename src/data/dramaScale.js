// Turning a drama arc into sparkline bar heights.
//
// EXTRACTED FROM DeskCard, and not only for tidiness. The guard for this needs
// to call the SHIPPED function; DeskCard pulls in deskStore, a dozen named
// relay exports and JSX, so testing it there meant either bundling the whole
// component or re-implementing the formula in the test. The second is what the
// first draft of the guard did, and a mirrored formula is free to drift away
// from the real one silently -- the exact failure these guards exist to stop.
// Pure module, no imports, so the test calls the real thing.
//
// DRAMA IS A 0-100 SCORE. Confirmed in three independent places rather than
// assumed: TonightsPick ("drama_peak 0-100, the real ported field"),
// terrainFlight's HEIGHT_SCALE ("0-100 real range -> 0-35 tall"), and
// broadcastCall ("a real drama peak of ${finalPeak} out of 100").
// Parsing drama_arc, against the shapes that ACTUALLY occur.
//
// Measured 2026-08-11 over 1484 real games across 120 days
// (outbox/drama-arc-shapes-*.txt), uncensored /context/date/ sweep:
//
//     array         1022   68.9%   a bare JSON array of numbers
//     SQL null       334   22.5%   no drama recorded
//     string "null"  121    8.2%   the FOUR-CHARACTER STRING, not null
//     object           7    0.5%   {peak, ..., samples:[{s,p}]}
//
// A NARROWER SWEEP GOT THIS WRONG. A 45-day run reported ZERO objects and this
// file said the shape "was not found". It exists; the window started
// 2026-06-27 and every object row predates it:
//
//     2026-04   0     2026-05   6     2026-06   1     2026-07   0     2026-08   0
//
// All 7 are NBA. So the client write path DID land rows, and then stopped
// after June -- 0 objects against 497 and 122 array rows in July and August.
// Absence of evidence over a window is not evidence of absence; the fix was
// to widen the window past the feature's ship date, not to reason harder.
//
// THE OBJECT'S REAL SHAPE. Across 37 real sample records:
//
//     s   37/37 (100%)  number   the drama score, 0-100
//     p   37/37 (100%)  number   period
//
// No `t`, and `peakMinute` is null on all 7. The Drive storage-layer doc does
// specify [{t, s, p}] -- but that describes the localStorage key
// field_drama_history_{gameId}, NOT this field. drama_arc is a derived object
// whose samples drop the timestamp. Two layers, both documented accurately;
// reading one as the other is what made this look like a divergence.
//
// WHERE THESE COME FROM, which explains why there are only 7. Per "FIELD
// Architecture -- 03 Drama Intelligence System": dramaScoreLive "runs inside
// injectDramaBadges() on every ESPN poll cycle (every 30 seconds for live
// games)". The object shape accumulates in a BROWSER, during a LIVE game,
// while a human has the app open. It is not a cron product, so its volume
// tracks what someone watched -- 7 NBA games across the May-June playoffs.
//
// THE STRING "null" IS A RELAY DEFECT, not a format. All 121 carry
// drama_peak: 0, concentrated in EFL Cup, golf, PGA Tour and CFL -- exactly
// the sports anomalyBaseline records as never having drama computed. It means
// "no drama here", stored as a stringified null rather than SQL NULL. Handled
// explicitly because the two spellings of absent are a real trap for anything
// querying `WHERE drama_arc IS NULL`.
export function parseDramaArc(raw) {
  if (raw === null || raw === undefined) return null
  const value = typeof raw === 'string' ? tryParse(raw) : raw
  if (Array.isArray(value)) return value
  // The object form carries the series under `samples`, each element {s, p}.
  // Only `s` is read: `p` is the period, useful for axis markers the glyph
  // does not draw. A non-numeric or missing `s` drops that sample rather than
  // becoming NaN and poisoning the max.
  if (value && typeof value === 'object' && Array.isArray(value.samples)) {
    const series = value.samples
      .map(x => (x && typeof x === 'object' ? x.s : x))
      .filter(v => typeof v === 'number' && Number.isFinite(v))
    return series.length ? series : null
  }
  return null
}

function tryParse(raw) {
  try { return JSON.parse(raw) } catch { return null }
}

export const DRAMA_MAX = 100
export const TARGET_BARS = 30

// Bucketed MAX rather than every-Nth sample.
//
// Stride sampling can step straight over a spike. That was survivable while
// bars were normalised to the series' own maximum -- the tallest bar was 100%
// whichever value it happened to be -- but on a fixed domain the tallest bar
// is supposed to equal drama_peak, so a dropped peak becomes a visible
// disagreement between the chart and its own label.
//
// Bucketing by max preserves the peak by construction: every element falls in
// exactly one bucket and each bucket contributes its largest value.
//
// Measured caveat, so this is not read as a fix for an observed break: on the
// one real arc available (821 samples, 7 distinct values, range 44..74) stride
// kept the peak at all 27 phase offsets, because the max recurs constantly.
// That is a property of that arc, not a guarantee for a spiky game.
//
// THE TRADE-OFF THIS BUYS THE PEAK WITH, stated because it is a real cost:
// bucketing by max draws the UPPER ENVELOPE, so a dip inside a window is
// invisible. Bucket-mean would show that jitter, but it cannot hold the
// invariant that makes the fixed scale checkable -- the tallest bar equalling
// drama_peak -- because averaging pulls the peak down. For a chart captioned
// with a peak, matching that caption is worth more than intra-window texture.
// On the real arc the two differ mildly: max renders a clean
// 52...59...68...74 staircase, mean renders the same rise with jitter
// (74 74 58 61 74 68 71 67 62 across the tail).
export function downsampleMax(arc, targetBars = TARGET_BARS) {
  if (!Array.isArray(arc)) return []
  const nums = arc.filter(v => typeof v === 'number' && Number.isFinite(v))
  if (nums.length <= targetBars) return nums
  const out = []
  for (let b = 0; b < targetBars; b++) {
    const start = Math.floor((b * nums.length) / targetBars)
    const end = Math.floor(((b + 1) * nums.length) / targetBars)
    let m = -Infinity
    for (let i = start; i < end; i++) if (nums[i] > m) m = nums[i]
    if (m > -Infinity) out.push(m)
  }
  return out
}

// Bar heights as percentages. On a fixed domain the height IS the drama value,
// so no rescaling happens anywhere in here.
//
// A value above the documented range is clamped, not accommodated: stretching
// the chart around an out-of-range point would quietly redefine what every
// other bar on the card means, which is a worse failure than one flat top.
export function dramaBars(arc, targetBars = TARGET_BARS) {
  if (!Array.isArray(arc) || arc.length === 0) return []
  return downsampleMax(arc, targetBars)
    .map(v => Math.max(0, Math.min(100, Math.round((v / DRAMA_MAX) * 100))))
}
