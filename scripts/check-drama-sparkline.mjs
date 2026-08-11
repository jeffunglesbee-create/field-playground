#!/usr/bin/env node
// Guard for the drama sparkline's scale.
//
// THE DEFECT. Bars were normalised to the series' own maximum
// (`v / Math.max(...sampled, 1)`), so the tallest bar was always 100% by
// construction. A real 821-sample arc spanning 44..74 rendered as 59%..100%
// -- a near-full wall -- and no two cards were comparable, because a game
// peaking at 20 drew the same silhouette as one peaking at 95.
//
// Drama is a documented 0-100 score (TonightsPick, terrainFlight, and
// broadcastCall all say so independently), so the fix is a fixed domain: bar
// height in percent IS the drama value.
//
// THE INVARIANT THAT ONLY EXISTS ONCE THE SCALE IS FIXED: the tallest bar must
// equal drama_peak. Under self-normalisation that was vacuous -- the tallest
// bar was 100% no matter what -- which is exactly why a downsampler that steps
// over the peak could never be caught. Now it can.
//
// Runs the SHIPPED functions via esbuild rather than a copy, same posture as
// the other guards here.

// Imports the SHIPPED module directly -- no bundling, and crucially no
// re-implementation of the formula. The first draft of this guard mirrored the
// render maths locally, which would have kept passing if the component's copy
// drifted. Extracting src/data/dramaScale.js was what made a real call
// possible.
import { dramaBars, downsampleMax, DRAMA_MAX, parseDramaArc } from '../src/data/dramaScale.js'

const render = arc => dramaBars(arc)

let failures = 0
const ok = (label, cond, detail = '') => {
  if (!cond) failures++
  console.log(`  ${cond ? 'ok  ' : 'FAIL'}  ${label}${detail ? '   ' + detail : ''}`)
}

console.log(`drama scale is a fixed domain (DRAMA_MAX = ${DRAMA_MAX})`)
ok('DRAMA_MAX is the documented 0-100 scale', DRAMA_MAX === 100, `got ${DRAMA_MAX}`)

// ---- the regression: a mid-range arc must NOT fill the track ----
console.log('')
console.log('a mid-range game must not render as a full wall')
// Shaped like the real measured arc: 821 samples climbing 44 -> 74. The real
// one renders as a staircase (52...59...68...74) under this code and as a wall
// topping out at 100 under the old self-normalising version.
const midArc = Array.from({ length: 821 }, (_, i) => 44 + Math.round((30 * i) / 820))
const midBars = render(midArc)
const midMax = Math.max(...midBars), midMin = Math.min(...midBars)
ok('tallest bar equals the arc max, not 100', midMax === 74, `max bar ${midMax}%`)
ok('the track is NOT filled', midMax < 100, `max bar ${midMax}%`)
ok('shortest bar sits at the real low end', midMin <= 46, `min bar ${midMin}%`)
// The whole point: a rising game must LOOK like it rises. Self-normalisation
// flattened the top half of this against its own ceiling.
ok('the shape is visible, not flattened', midBars[0] < midBars[midBars.length - 1],
   `${midBars[0]}% -> ${midBars[midBars.length - 1]}%`)
ok('more than a couple of distinct heights', new Set(midBars).size > 5,
   `${new Set(midBars).size} distinct`)

// ---- cross-card comparability, the property self-normalisation destroyed ----
console.log('')
console.log('two games with different peaks must render different heights')
const quiet = Array.from({ length: 400 }, (_, i) => 8 + (i % 5))    // peak 12
const wild = Array.from({ length: 400 }, (_, i) => 60 + (i % 36))   // peak 95
const qMax = Math.max(...render(quiet)), wMax = Math.max(...render(wild))
ok('quiet game stays short', qMax === 12, `${qMax}%`)
ok('wild game is tall', wMax === 95, `${wMax}%`)
ok('the two are distinguishable', qMax !== wMax, `${qMax}% vs ${wMax}%`)

// ---- the peak must survive downsampling ----
// This is the assertion that self-normalisation made impossible to write. A
// single-sample spike is exactly what stride sampling steps over.
console.log('')
console.log('a one-sample spike must survive downsampling')
const spiky = Array.from({ length: 900 }, () => 30)
spiky[547] = 97 // deliberately off any 900/30 = 30-stride grid point
const spikeBars = render(spiky)
ok('spike is preserved', Math.max(...spikeBars) === 97, `tallest bar ${Math.max(...spikeBars)}%`)

// Demonstrate the old stride approach would have LOST it, so the choice of
// bucketed-max is justified by a case rather than by preference.
const step = Math.max(1, Math.floor(spiky.length / 30))
const strided = []
for (let i = 0; i < spiky.length; i += step) strided.push(spiky[i])
ok('(context) plain stride sampling would have dropped this spike',
   Math.max(...strided) !== 97, `stride max ${Math.max(...strided)}`)

// ---- edges ----
console.log('')
console.log('edges')
ok('empty arc renders nothing', render([]).length === 0)
ok('all-zero arc renders an empty track, not a 4% floor',
   render(Array(100).fill(0)).every(h => h === 0))
ok('short arc is not padded', render([10, 20, 30]).length === 3)
ok('out-of-range value clamps rather than rescaling the card',
   Math.max(...render([50, 150])) === 100)
ok('non-numeric entries are dropped, not coerced',
   render([10, null, 'x', 20]).length === 2)

// ---- the shapes drama_arc actually takes, measured 2026-08-11 ----
// 1484 real games over 120 days: 1022 array, 334 SQL null, 121 the STRING
// "null", 7 object. Each branch corresponds to a shape that was COUNTED.
//
// An earlier 45-day run reported ZERO objects and this file asserted the
// object shape returns null. That assertion was measuring a too-narrow window,
// not the data: all 7 object rows are from May and June, and the window began
// 2026-06-27. Widening it past the feature's ship date found them.
console.log('')
console.log('parseDramaArc over the measured shape census (1484 games, 120 days)')
ok('array of numbers -> the array (1022 rows, 68.9%)',
   JSON.stringify(parseDramaArc('[10,20,30]')) === '[10,20,30]')
ok('SQL null -> null (334 rows, 22.5%)', parseDramaArc(null) === null)
// The four-character string, not a null. All 121 carry drama_peak 0, on
// sports anomalyBaseline records as never computing drama.
ok('the STRING "null" -> null (121 rows, 8.2%)', parseDramaArc('null') === null)

// THE OBJECT SHAPE, verbatim from a real measured row (NBA, drama_peak 52).
// Note there is no `t` in the samples, though the Drive storage-layer doc
// specifies [{t,s,p}] -- 37 of 37 real sample records carry only s and p.
const REAL_OBJECT_ARC = JSON.stringify({
  peak: 52, peakPeriod: 1, peakMinute: null, sustainedMinutes: 0,
  trend: 'steady', classification: 'sleeper',
  samples: [{ s: 52, p: 1 }, { s: 52, p: 1 }, { s: 52, p: 0 }, { s: 44, p: 0 }, { s: 29, p: 4 }],
})
ok('object shape -> the s series (7 rows, 0.5%)',
   JSON.stringify(parseDramaArc(REAL_OBJECT_ARC)) === '[52,52,52,44,29]')
ok('object arc renders bars on the same fixed domain',
   JSON.stringify(dramaBars(parseDramaArc(REAL_OBJECT_ARC))) === '[52,52,52,44,29]')
// The tallest bar must equal the object's own stated peak, the same invariant
// the fixed domain creates for array arcs.
ok('tallest bar equals the object\'s stated peak',
   Math.max(...dramaBars(parseDramaArc(REAL_OBJECT_ARC))) === 52)
ok('object with empty samples -> null, not an empty chart',
   parseDramaArc('{"peak":0,"samples":[]}') === null)
ok('object with no samples key -> null',
   parseDramaArc('{"peak":74,"trend":"steady"}') === null)
ok('non-numeric samples are dropped, not coerced to NaN',
   JSON.stringify(parseDramaArc('{"samples":[{"s":10},{"s":null},{"s":20}]}')) === '[10,20]')

ok('already-parsed array passes through', Array.isArray(parseDramaArc([1, 2])))
ok('garbage -> null, not a throw', parseDramaArc('{not json') === null)
ok('a number -> null', parseDramaArc(42) === null)

console.log('')
if (failures) {
  console.log(`${failures} failure(s).`)
  process.exit(1)
}
console.log('All drama-sparkline checks passed.')
