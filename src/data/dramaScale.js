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
