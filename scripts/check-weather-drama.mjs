#!/usr/bin/env node
// Guard for weatherDramaModifier, ported from production 2026-08-11.
//
// WHY EVERY BAND IS TESTED AT ITS BOUNDARY. The whole function is a stack of
// threshold comparisons, so every real defect it can have lives at a
// boundary: `>` versus `>=`, a band that fails to stack, a unit swapped
// underneath a constant. A test that only checks "cold weather gives a
// positive number" would pass on all of those.
//
// Offline, deterministic, no network. Calls the shipped module.

import {
  weatherDramaModifier,
  COLD_SEVERE_F, COLD_F, WIND_MPH, WIND_SEVERE_MPH,
  SNOW_MM, RAIN_MM, RAIN_SEVERE_MM, AQI_UNHEALTHY, AQI_VERY_UNHEALTHY,
} from '../src/data/weatherDrama.js'

let failures = 0
const ok = (label, cond, detail = '') => {
  if (!cond) failures++
  console.log(`  ${cond ? 'ok  ' : 'FAIL'}  ${label}${detail ? '   ' + detail : ''}`)
}
const d = wx => weatherDramaModifier(wx).delta

console.log('constants match the source spec verbatim')
ok('cold bands 0F / 28F', COLD_SEVERE_F === 0 && COLD_F === 28)
ok('wind bands 20 / 30 mph', WIND_MPH === 20 && WIND_SEVERE_MPH === 30)
ok('precip bands snow 0.5mm, rain 2mm / 5mm',
   SNOW_MM === 0.5 && RAIN_MM === 2 && RAIN_SEVERE_MM === 5)
ok('AQI bands 150 / 200', AQI_UNHEALTHY === 150 && AQI_VERY_UNHEALTHY === 200)

// ---- boundaries. The spec says "<" for cold and ">" for everything else. ----
console.log('')
console.log('cold: strictly BELOW the threshold, and the two bands stack')
ok('28F exactly -> 0 (not below 28)', d({ tempF: 28 }) === 0, `got ${d({ tempF: 28 })}`)
ok('27F -> +8', d({ tempF: 27 }) === 8, `got ${d({ tempF: 27 })}`)
ok('0F exactly -> +8 (below 28, not below 0)', d({ tempF: 0 }) === 8, `got ${d({ tempF: 0 })}`)
ok('-1F -> +16 (both bands stack)', d({ tempF: -1 }) === 16, `got ${d({ tempF: -1 })}`)

console.log('')
console.log('wind: strictly ABOVE the threshold, and the two bands stack')
ok('20mph exactly -> 0', d({ windMph: 20 }) === 0, `got ${d({ windMph: 20 })}`)
ok('21mph -> +6', d({ windMph: 21 }) === 6, `got ${d({ windMph: 21 })}`)
ok('30mph exactly -> +6', d({ windMph: 30 }) === 6, `got ${d({ windMph: 30 })}`)
ok('31mph -> +10 (both bands stack)', d({ windMph: 31 }) === 10, `got ${d({ windMph: 31 })}`)

console.log('')
console.log('precipitation')
ok('snow 0.5mm exactly -> 0', d({ snowMm: 0.5 }) === 0)
ok('snow 0.6mm -> +10', d({ snowMm: 0.6 }) === 10)
ok('rain 2mm exactly -> 0', d({ rainMm: 2 }) === 0)
ok('rain 2.1mm -> +8', d({ rainMm: 2.1 }) === 8)
ok('rain 5mm exactly -> +8', d({ rainMm: 5 }) === 8)
ok('rain 5.1mm -> +12 (both bands stack)', d({ rainMm: 5.1 }) === 12)

// The only negative term. If AQI is ever dropped from the fetch this is the
// assertion that notices, because every other band is positive.
console.log('')
console.log('AQI is the only NEGATIVE term')
ok('AQI 150 exactly -> 0', d({ aqi: 150 }) === 0)
ok('AQI 151 -> -15', d({ aqi: 151 }) === -15, `got ${d({ aqi: 151 })}`)
ok('AQI 200 exactly -> -15', d({ aqi: 200 }) === -15)
ok('AQI 201 -> -25 (both bands stack)', d({ aqi: 201 }) === -25, `got ${d({ aqi: 201 })}`)

console.log('')
console.log('terms combine across categories, and can cancel')
// A freezing, windy, smoky night: +8 cold, +6 wind, -15 AQI.
ok('cold + wind + unhealthy air -> -1',
   d({ tempF: 20, windMph: 25, aqi: 160 }) === -1,
   `got ${d({ tempF: 20, windMph: 25, aqi: 160 })}`)
ok('reasons are named, not just a number',
   weatherDramaModifier({ tempF: 20, windMph: 25, aqi: 160 }).reasons.length === 3)

console.log('')
console.log('missing and malformed input contributes nothing rather than NaN')
ok('empty object -> 0', d({}) === 0)
ok('null -> 0', d(null) === 0)
ok('undefined fields -> 0', d({ tempF: undefined, windMph: null }) === 0)
ok('NaN temp -> 0, not NaN', d({ tempF: NaN }) === 0)
ok('string temp -> 0, not coerced', d({ tempF: '-40' }) === 0, `got ${d({ tempF: '-40' })}`)
// A missing AQI must drop the negative term, never invert the sign of the
// rest. This is the shape a failed AQI fetch takes.
ok('null AQI leaves the positive terms intact',
   d({ tempF: 20, windMph: 25, aqi: null }) === 14,
   `got ${d({ tempF: 20, windMph: 25, aqi: null })}`)

console.log('')
if (failures) {
  console.log(`${failures} failure(s).`)
  process.exit(1)
}
console.log('All weather-drama checks passed.')
