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
  weatherDramaModifier, normalizeOpenMeteo,
  wxAlert, weatherDramaGate, weatherDramaContribution,
  COLD_SEVERE_F, COLD_F, WIND_MPH, WIND_SEVERE_MPH,
  SNOW_MM, RAIN_MM, RAIN_SEVERE_MM, AQI_UNHEALTHY, AQI_VERY_UNHEALTHY,
  AQI_GATE, HOT_F, GUST_ALERT_MPH, RAIN_ALERT_MM,
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

// ---- boundaries. Fields and thresholds below are taken from the SHIPPED
// source (jubilant-bassoon src/utils/weather.js, sha 0ecfaf5, read
// 2026-08-11), not from the session doc's paraphrase of it. The doc reads as
// "cold / wind / rain"; the code reads apparent temperature, gusts, and
// precipitation. Three of these assertions fail against a doc-faithful port.
console.log('')
console.log('cold reads APPARENT temperature, strictly below, and the bands stack')
ok('feels 28F exactly -> 0', d({ feelsLikeF: 28 }) === 0, `got ${d({ feelsLikeF: 28 })}`)
ok('feels 27F -> +8', d({ feelsLikeF: 27 }) === 8, `got ${d({ feelsLikeF: 27 })}`)
ok('feels 0F exactly -> +8', d({ feelsLikeF: 0 }) === 8, `got ${d({ feelsLikeF: 0 })}`)
ok('feels -1F -> +16 (both bands stack)', d({ feelsLikeF: -1 }) === 16, `got ${d({ feelsLikeF: -1 })}`)
// The correction that a doc-faithful port gets wrong on ordinary winter
// nights: dry-bulb above the band, wind chill below it.
ok('30F air that FEELS like 24F scores +8, not 0',
   d({ tempF: 30, feelsLikeF: 24 }) === 8, `got ${d({ tempF: 30, feelsLikeF: 24 })}`)
ok('feelsLike WINS over tempF when both are present',
   d({ tempF: 10, feelsLikeF: 40 }) === 0, `got ${d({ tempF: 10, feelsLikeF: 40 })}`)
ok('tempF is the fallback when feelsLike is absent',
   d({ tempF: 27 }) === 8, `got ${d({ tempF: 27 })}`)
// Mirrors `wx.feelsLike !== undefined ? ... : wx.temp` -- an explicit presence
// check, so a real 0F feels-like is used rather than falling through.
ok('a feels-like of exactly 0F is respected, not treated as absent',
   d({ tempF: 80, feelsLikeF: 0 }) === 8, `got ${d({ tempF: 80, feelsLikeF: 0 })}`)

console.log('')
console.log('wind reads GUSTS (falling back to sustained), strictly above')
ok('gusts 20mph exactly -> 0', d({ gustsMph: 20 }) === 0, `got ${d({ gustsMph: 20 })}`)
ok('gusts 21mph -> +6', d({ gustsMph: 21 }) === 6, `got ${d({ gustsMph: 21 })}`)
ok('gusts 30mph exactly -> +6', d({ gustsMph: 30 }) === 6, `got ${d({ gustsMph: 30 })}`)
ok('gusts 31mph -> +10 (both bands stack)', d({ gustsMph: 31 }) === 10, `got ${d({ gustsMph: 31 })}`)
ok('gusts WIN over sustained wind', d({ windMph: 5, gustsMph: 35 }) === 10,
   `got ${d({ windMph: 5, gustsMph: 35 })}`)
ok('sustained wind is the fallback when gusts are absent',
   d({ windMph: 25 }) === 6, `got ${d({ windMph: 25 })}`)
// Mirrors `wx.gusts || wx.wind || 0` -- plain falsiness, so a 0 gust reading
// falls THROUGH to sustained wind rather than scoring 0.
ok('a gust reading of exactly 0 falls through to sustained wind',
   d({ windMph: 25, gustsMph: 0 }) === 6, `got ${d({ windMph: 25, gustsMph: 0 })}`)

console.log('')
console.log('precipitation: rain drives +8, PRECIP drives the +4 escalation')
ok('snow 0.5mm exactly -> 0', d({ snowMm: 0.5 }) === 0)
ok('snow 0.6mm -> +10', d({ snowMm: 0.6 }) === 10)
ok('rain 2mm exactly -> 0', d({ rainMm: 2 }) === 0)
ok('rain 2.1mm -> +8', d({ rainMm: 2.1 }) === 8)
// The field swap the doc hides. 6mm of RAIN alone is +8, not +12 -- the
// escalation needs the PRECIPITATION field to be over 5.
ok('rain 6mm with no precip field -> +8, NOT +12',
   d({ rainMm: 6 }) === 8, `got ${d({ rainMm: 6 })}`)
ok('precip 5mm exactly -> 0 on its own', d({ precipMm: 5 }) === 0)
ok('precip 5.1mm -> +4 on its own', d({ precipMm: 5.1 }) === 4, `got ${d({ precipMm: 5.1 })}`)
ok('rain 6mm AND precip 6mm -> +12 (both bands stack)',
   d({ rainMm: 6, precipMm: 6 }) === 12, `got ${d({ rainMm: 6, precipMm: 6 })}`)
// precipitation includes snow, so the +4 can ride on a snow event with no
// rain at all -- which is the whole reason the field differs.
ok('snow event with precip over 5mm gets the +4 with zero rain',
   d({ snowMm: 1, precipMm: 6, rainMm: 0 }) === 14,
   `got ${d({ snowMm: 1, precipMm: 6, rainMm: 0 })}`)

// ---- the unit conversion, found by the e2e probe on its first run ----
// Open-Meteo returns snowfall in CENTIMETRES while the band is in MM. Feeding
// cm straight in made the band fire at 5mm instead of 0.5mm -- 10x too heavy,
// silently. These assertions exist so that stays fixed.
console.log('')
console.log('normalizeOpenMeteo: snowfall arrives in cm, thresholds are in mm')
const nz = normalizeOpenMeteo({ temperature_2m: 40, wind_speed_10m: 5, rain: 1, snowfall: 0.2 })
ok('0.2cm becomes 2mm', nz.snowMm === 2, `got ${nz.snowMm}`)
ok('a 0.2cm dusting now MEETS the 0.5mm band', d(nz) === 10, `got ${d(nz)}`)
// The pre-fix behaviour, asserted as the thing that must not come back.
ok('unconverted 0.2 would have missed the band', d({ snowMm: 0.2 }) === 0)
ok('rain passes through unconverted (already mm)',
   normalizeOpenMeteo({ rain: 3 }).rainMm === 3)
ok('temperature and wind pass through (requested as F and mph)',
   nz.tempF === 40 && nz.windMph === 5)
ok('apparent_temperature maps to feelsLikeF',
   normalizeOpenMeteo({ apparent_temperature: 18 }).feelsLikeF === 18)
ok('precipitation maps to precipMm, distinct from rain',
   normalizeOpenMeteo({ precipitation: 7, rain: 3 }).precipMm === 7 &&
   normalizeOpenMeteo({ precipitation: 7, rain: 3 }).rainMm === 3)
ok('missing fields normalise to null, not 0',
   normalizeOpenMeteo({}).snowMm === null && normalizeOpenMeteo({}).tempF === null)
ok('null current -> all null, no throw', normalizeOpenMeteo(null).tempF === null)

// ---- THE GATE. Ported 2026-08-11 after reading the May 22 production doc. ----
//
// These assertions exist because the app previously rendered a live "+N drama"
// chip for every venue with a non-zero band total, which claimed a
// contribution production would never make. The gate is not a refinement of
// the band table; it decides whether the band table is consulted at all.
const ap = wx => weatherDramaContribution(wx).applied

console.log('')
console.log('gate constants match the source spec verbatim')
ok(`AQI gate is ${AQI_GATE}, BELOW the -15 band at ${AQI_UNHEALTHY}`,
   AQI_GATE === 100 && AQI_GATE < AQI_UNHEALTHY)
ok('wxAlert bands: gusts 30mph, rain 5mm, hot 100F',
   GUST_ALERT_MPH === 30 && RAIN_ALERT_MM === 5 && HOT_F === 100)

console.log('')
console.log('the gate admits on either arm, and names which')
ok('snow trips wxAlert', weatherDramaGate({ snowMm: 0.6 }).open)
ok('31mph GUSTS trip wxAlert', weatherDramaGate({ gustsMph: 31 }).open)
ok('30mph gusts exactly do NOT', weatherDramaGate({ gustsMph: 30 }).open === false)
ok('105F trips wxAlert (hot arm, and it reads DRY-BULB temp)', weatherDramaGate({ tempF: 105 }).open)
ok('AQI 101 opens the gate on the AQI arm', weatherDramaGate({ aqi: 101 }).open)
ok('AQI 100 exactly does NOT', weatherDramaGate({ aqi: 100 }).open === false)
ok('the reason names the AQI arm',
   /AQI 101/.test(weatherDramaGate({ aqi: 101 }).why ?? ''),
   `got ${JSON.stringify(weatherDramaGate({ aqi: 101 }).why)}`)
ok('calm and clean -> gate shut', weatherDramaGate({ tempF: 70, gustsMph: 5 }).open === false)
ok('null -> gate shut, no throw', weatherDramaGate(null).open === false)

// THE DEAD ZONE. The single most counterintuitive consequence, and the one
// that had the app reporting numbers production never applies. Sustained wind
// and gusts are DIFFERENT FIELDS; the modifier reads one and the gate reads
// the other, so a band total can be non-zero with the gate shut.
console.log('')
console.log('the dead zone: band total non-zero, gate shut, production applies 0')
// Both the modifier and wxAlert read gusts; the gap is that the modifier
// SCORES at >20 while the alert only ADMITS at >30.
const windyNotGusty = { tempF: 40, feelsLikeF: 40, windMph: 25, gustsMph: 28 }
ok('28mph gusts score +6 on the table', weatherDramaModifier(windyNotGusty).delta === 6,
   `got ${weatherDramaModifier(windyNotGusty).delta}`)
ok('...but 28mph gusts are under the 30mph alert, so the gate stays shut',
   weatherDramaGate(windyNotGusty).open === false)
ok('...so the APPLIED contribution is 0', ap(windyNotGusty) === 0, `got ${ap(windyNotGusty)}`)
const moderateRain = { tempF: 50, feelsLikeF: 50, rainMm: 3 }
ok('3mm rain scores +8 on the table', weatherDramaModifier(moderateRain).delta === 8)
ok('...but is under the 5mm alert, so applied is 0', ap(moderateRain) === 0)
// The mirror: push the same venue past the alert threshold and it lands.
ok('31mph gusts clear the alert -- and now score +10, not +6',
   ap({ ...windyNotGusty, gustsMph: 31 }) === 10, `got ${ap({ ...windyNotGusty, gustsMph: 31 })}`)

// AQI 101-150 IS A KEY THAT SCORES NOTHING. It opens the gate while sitting
// below the -15 band, so its entire effect is to let the OTHER terms through.
console.log('')
console.log('AQI 101-150 opens the gate and scores zero itself')
ok('AQI 120 alone contributes 0', weatherDramaModifier({ aqi: 120 }).delta === 0)
ok('AQI 120 alone still applies 0 (nothing else to admit)', ap({ aqi: 120 }) === 0)
// The AQI arm only MATTERS where nothing else opens the gate, and getting
// that wrong is easy: a 20F park was tried here first as "cold and windy and
// smoky", which does apply +14 -- but not because of the smoke. 20F is below
// COLD_F, so wxAlert already fired on the cold arm and the AQI was doing
// nothing. This assertion pair pins that down, because a demonstration that
// would have passed without the AQI term proves nothing about the AQI term.
ok('a 20F park opens the gate on the COLD arm, smoke or not',
   ap({ tempF: 20, feelsLikeF: 20, gustsMph: 26, aqi: 120 }) === 14 &&
   ap({ tempF: 20, feelsLikeF: 20, gustsMph: 26, aqi: 40 }) === 14,
   `smoky ${ap({ tempF: 20, feelsLikeF: 20, gustsMph: 26, aqi: 120 })}, clean ${ap({ tempF: 20, feelsLikeF: 20, gustsMph: 26, aqi: 40 })}`)
// A MILD windy park trips nothing on its own, so here the AQI arm is the only
// thing that can open the gate -- and it flips 0 to +6 while scoring 0 itself.
const mildWindy = { tempF: 45, feelsLikeF: 45, gustsMph: 26 }
ok('mild + windy, clean air -> gate shut, applies 0', ap({ ...mildWindy, aqi: 40 }) === 0)
ok('same park under AQI 120 -> applies +6, contributed entirely by the WIND',
   ap({ ...mildWindy, aqi: 120 }) === 6, `got ${ap({ ...mildWindy, aqi: 120 })}`)
ok('the smoke itself scored none of that +6',
   weatherDramaModifier({ aqi: 120 }).delta === 0)

// HOT_F has no counterpart in the band table. Recorded as production's
// asymmetry, not silently patched with an invented heat band.
console.log('')
console.log('heat opens the gate and has no band of its own')
ok('105F trips wxAlert', wxAlert({ tempF: 105 }))
ok('105F scores 0 on the table (every temp band is a COLD band)',
   weatherDramaModifier({ tempF: 105, feelsLikeF: 108 }).delta === 0)
ok('105F alone therefore applies 0 despite an open gate', ap({ tempF: 105, feelsLikeF: 108 }) === 0)

console.log('')
console.log('contribution reports delta and applied separately')
const c = weatherDramaContribution(windyNotGusty)
ok('delta keeps the band total', c.delta === 6)
ok('applied is the gated number', c.applied === 0)
ok('reasons survive even when applied is 0', c.reasons.length === 1)

console.log('')
console.log('normalizeOpenMeteo carries gusts, which the gate needs')
ok('wind_gusts_10m maps to gustsMph',
   normalizeOpenMeteo({ wind_gusts_10m: 34 }).gustsMph === 34)
// wxAlert reads `wx.gusts || wx.wind`, so sustained wind DOES reach it as a
// fallback -- 40mph sustained with no gust field still opens the gate.
ok('missing gusts -> null, but sustained wind still reaches wxAlert',
   normalizeOpenMeteo({}).gustsMph === null &&
   weatherDramaGate(normalizeOpenMeteo({ wind_speed_10m: 40 })).open === true)

console.log('')
if (failures) {
  console.log(`${failures} failure(s).`)
  process.exit(1)
}
console.log('All weather-drama checks passed.')
