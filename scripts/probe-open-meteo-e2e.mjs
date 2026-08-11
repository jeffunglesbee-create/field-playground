#!/usr/bin/env node
// End-to-end verification of the weather path, on a runner with real network.
//
// WHY CI. api.open-meteo.com is blocked by this sandbox's egress allowlist, so
// nothing about the live weather path can be observed locally -- the same
// constraint that forced the original CORS check onto a runner
// (.github/workflows/open-meteo-probe.yml). The modifier is unit-tested
// offline at every band boundary; what is NOT testable there is whether the
// real API still returns the fields and the UNITS those bands assume.
//
// THE UNITS CHECK IS THE POINT, not the status code. weatherDramaModifier's
// thresholds are Fahrenheit, mph and millimetres. Open-Meteo returns a
// `current_units` block stating what it actually sent. If a default ever
// changes, or a request parameter is dropped, every threshold silently
// rescales -- 28F becomes 28C, 20mph becomes 20km/h -- and every band fires at
// the wrong time with no error anywhere. That is exactly the silent-wrongness
// class this repo keeps finding, so it is asserted rather than assumed.
//
// Calls the SHIPPED modifier. VENUE_COORDS is read out of the shipped
// weather.js rather than duplicated here: a copied venue table would drift.

import { readFileSync, mkdirSync, writeFileSync } from 'node:fs'
import { weatherDramaContribution, normalizeOpenMeteo } from '../src/data/weatherDrama.js'

mkdirSync('outbox', { recursive: true })
const stamp = new Date().toISOString().replace(/[:.]/g, '-')
const outPath = 'outbox/open-meteo-e2e-' + stamp + '.txt'
const out = []
const log = s => { out.push(s); console.log(s); try { writeFileSync(outPath, out.join('\n')) } catch {} }

const OM = 'https://api.open-meteo.com/v1/forecast'
const AQ = 'https://air-quality-api.open-meteo.com/v1/air-quality'
const CURRENT = 'temperature_2m,apparent_temperature,precipitation,rain,snowfall,is_day,wind_speed_10m,wind_direction_10m,wind_gusts_10m'

// Read the real table out of the shipped module.
const src = readFileSync('src/data/weather.js', 'utf8')
const venues = [...src.matchAll(/'([^']+)':\s*\[\s*(-?[\d.]+),\s*(-?[\d.]+),\s*'(\w+)'\]/g)]
  .map(m => ({ venue: m[1], lat: Number(m[2]), lon: Number(m[3]), roof: m[4] }))

let failures = 0
const ok = (label, cond, detail = '') => {
  if (!cond) failures++
  log(`  ${cond ? 'ok  ' : 'FAIL'}  ${label}${detail ? '   ' + detail : ''}`)
}

log('probe_at: ' + new Date().toISOString())
log('purpose: verify the live weather path end to end -- reachability, FIELDS, UNITS,')
log('and the shipped modifier running on real returned data.')
log('')
log(`venue table read from src/data/weather.js: ${venues.length} entries`)

if (!venues.length) {
  log('FAILED to parse any venue from the shipped table -- aborting rather than')
  log('inventing coordinates.')
  process.exit(1)
}

// A geographically spread sample: a hot one, a cold/high one, a coastal one,
// and a wildcard. Spread matters -- a single venue could pass on a calm day
// while a unit bug hid in a field that happened to be zero there.
const WANT = ['Chase Field', 'Coors Field', 'Oracle Park', 'Fenway Park', 'Wrigley Field']
const sample = WANT.map(n => venues.find(v => v.venue === n)).filter(Boolean)
log(`sampling ${sample.length}: ${sample.map(v => v.venue).join(', ')}`)
log('')

const results = []
for (const v of sample) {
  log(`=== ${v.venue} (${v.lat}, ${v.lon}, ${v.roof}) ===`)
  let fx
  try {
    const res = await fetch(`${OM}?latitude=${v.lat}&longitude=${v.lon}&current=${CURRENT}&temperature_unit=fahrenheit&wind_speed_unit=mph&timezone=auto`)
    ok('forecast HTTP 200', res.ok, `status ${res.status}`)
    if (!res.ok) continue
    fx = await res.json()
  } catch (e) {
    failures++
    log(`  FAIL  forecast threw: ${String(e).slice(0, 120)}`)
    continue
  }

  const c = fx.current ?? {}
  const u = fx.current_units ?? {}

  // Second request, shaped like PRODUCTION's: hourly snowfall, no timezone
  // parameter. Production reads its snow value out of the hourly series and
  // this probe was only ever checking the current block, so the field that
  // actually drives the snow band was the one field never measured.
  let fxHourly = {}
  try {
    const hres = await fetch(`${OM}?latitude=${v.lat}&longitude=${v.lon}&hourly=snowfall,direct_radiation&wind_speed_unit=mph&temperature_unit=fahrenheit`)
    ok('hourly forecast HTTP 200', hres.ok, `status ${hres.status}`)
    if (hres.ok) fxHourly = await hres.json()
  } catch (e) {
    failures++
    log(`  FAIL  hourly forecast threw: ${String(e).slice(0, 120)}`)
  }

  // Fields the app actually reads.
  // wind_gusts_10m is in this list because the GATE depends on it. If the API
  // ever drops it, normalizeOpenMeteo yields gustsMph: null, wxAlert can never
  // fire on wind, and every windy venue silently stops contributing to drama
  // with no error anywhere -- a shut-gate failure is indistinguishable from
  // calm weather unless something asserts the field arrived.
  // apparent_temperature is here for the same reason: the COLD bands read it
  // in preference to temperature_2m, so losing it silently downgrades every
  // cold band to dry-bulb and each one fires late by however much wind chill
  // was worth that night.
  for (const f of ['temperature_2m', 'apparent_temperature', 'rain', 'snowfall', 'wind_speed_10m', 'wind_gusts_10m', 'precipitation', 'is_day']) {
    ok(`field ${f} present`, f in c, `= ${JSON.stringify(c[f])}`)
  }

  // THE UNITS. Every weatherDramaModifier threshold depends on these.
  ok('temperature unit is Fahrenheit', u.temperature_2m === '°F', `got ${JSON.stringify(u.temperature_2m)}`)
  ok('wind unit is mph', u.wind_speed_10m === 'mp/h', `got ${JSON.stringify(u.wind_speed_10m)}`)
  ok('rain unit is mm', u.rain === 'mm', `got ${JSON.stringify(u.rain)}`)
  // Measured 2026-08-11: cm on every sampled venue. Asserted strictly now that
  // it is known, because a switch to mm would silently make the snow band fire
  // 10x too EARLY, the mirror of the bug this assertion originally found.
  ok('snowfall unit is cm (drives the x10 conversion)',
     u.snowfall === 'cm', `got ${JSON.stringify(u.snowfall)}`)

  // HOURLY snowfall, asserted separately from CURRENT, because production
  // reads the hourly series -- `(json.hourly?.snowfall||[])[getUTCHours()]` --
  // not the current block. The two are different response fields and nothing
  // guarantees they carry the same unit, so inferring hourly's unit from
  // current's would be exactly the kind of unchecked step this probe exists to
  // stop. Also asserts the default timezone, because an hourly array indexed
  // by UTC hour is only correct while the series itself is on GMT.
  const hu = fxHourly.hourly_units ?? {}
  ok('hourly snowfall unit is cm too', hu.snowfall === 'cm', `got ${JSON.stringify(hu.snowfall)}`)
  ok('hourly series is GMT by default, so a UTC-hour index lines up',
     (fxHourly.timezone_abbreviation ?? '') === 'GMT',
     `got ${JSON.stringify(fxHourly.timezone_abbreviation)}`)
  const hourlySnow = fxHourly.hourly?.snowfall
  ok('hourly.snowfall is an array covering a full day',
     Array.isArray(hourlySnow) && hourlySnow.length >= 24, `len ${hourlySnow?.length}`)

  let aqi = null
  let pm25 = null
  try {
    // us_aqi,pm2_5 -- production's exact fetchAQI params. us_aqi drives both
    // the gate (>100) and the negative band (>150); pm2_5 is the field that
    // distinguishes wildfire smoke from an ozone-driven index on the same
    // number, which is the case this whole term exists for.
    const ares = await fetch(`${AQ}?latitude=${v.lat}&longitude=${v.lon}&current=us_aqi,pm2_5`)
    ok('air-quality HTTP 200', ares.ok, `status ${ares.status}`)
    if (ares.ok) {
      const aj = await ares.json()
      aqi = aj?.current?.us_aqi ?? null
      pm25 = aj?.current?.pm2_5 ?? null
      ok('us_aqi present and numeric', typeof aqi === 'number', `= ${JSON.stringify(aqi)}`)
      ok('pm2_5 present and numeric', typeof pm25 === 'number', `= ${JSON.stringify(pm25)}`)
      // Measured 2026-08-11: "USAQI" on all five venues. This assertion was
      // first written as `=== ''` on the assumption that an index carries no
      // unit, and it failed on every venue -- the guess, not the API. Asserted
      // at its measured value now, because the thing worth catching is a
      // switch to european_aqi, whose 0-100+ scale is NOT interchangeable with
      // the US 0-500 one and would silently rescale both AQI thresholds.
      ok('us_aqi unit is USAQI, not the European scale',
         aj?.current_units?.us_aqi === 'USAQI',
         `got ${JSON.stringify(aj?.current_units?.us_aqi)}`)
    }
  } catch (e) {
    failures++
    log(`  FAIL  air-quality threw: ${String(e).slice(0, 120)}`)
  }

  // The shipped modifier, on real returned values.
  // Same normaliser the app uses, so a unit change breaks both together
  // rather than only in production.
  const wx = normalizeOpenMeteo(c, aqi)
  ok('snowfall normalised cm -> mm (x10)',
     c.snowfall === 0 ? wx.snowMm === 0 : wx.snowMm === c.snowfall * 10,
     `${c.snowfall}cm -> ${wx.snowMm}mm`)
  const { delta, reasons, gate, applied } = weatherDramaContribution(wx)
  log(`  live: ${Math.round(wx.tempF)}°F  ${wx.windMph}mph (gusts ${wx.gustsMph})  rain ${wx.rainMm}  snow ${wx.snowMm}  AQI ${aqi}  pm2.5 ${pm25}`)
  log(`  band table -> ${delta > 0 ? '+' : ''}${delta}${reasons.length ? '  (' + reasons.join(', ') + ')' : '  (no band met)'}`)
  log(`  gate       -> ${gate.open ? 'OPEN via ' + gate.why : 'SHUT'}    production applies ${applied > 0 ? '+' : ''}${applied}`)
  ok('delta is a finite number, never NaN', Number.isFinite(delta), `= ${delta}`)
  ok('applied is 0 whenever the gate is shut',
     gate.open || applied === 0, `gate ${gate.open}, applied ${applied}`)
  results.push({ venue: v.venue, delta, reasons, gate, applied, wx })
  log('')
}

log('=== SUMMARY ===')
log('  venue            band   gate                applied')
for (const r of results) {
  log(`  ${r.venue.padEnd(16)} ${((r.delta > 0 ? '+' : '') + r.delta).padEnd(6)} ${(r.gate.open ? r.gate.why : 'shut').padEnd(19)} ${(r.applied > 0 ? '+' : '') + r.applied}   ${r.reasons.join(', ') || '(none)'}`)
}
const anyNonZero = results.some(r => r.delta !== 0)
const anyApplied = results.some(r => r.applied !== 0)
const deadZone = results.filter(r => r.delta !== 0 && !r.gate.open)
log('')
log(anyNonZero
  ? '  At least one venue met a band, so the positive path is exercised on real data.'
  : '  Every venue scored 0 on the band table. That is a REAL RESULT, not a failure')
if (!anyNonZero) {
  log('  -- calm weather everywhere means no band was met. It does mean this run did')
  log('  not exercise any band end to end; the offline guard covers those.')
}
if (deadZone.length) {
  log('')
  log(`  DEAD ZONE OBSERVED ON REAL DATA: ${deadZone.length} venue(s) scored non-zero on the`)
  log('  band table with the gate shut, so production would apply nothing there:')
  for (const r of deadZone) log(`    ${r.venue}: ${(r.delta > 0 ? '+' : '') + r.delta} (${r.reasons.join(', ')})`)
  log('  This is the case the app used to render as a live "+N drama" chip.')
} else if (anyNonZero && anyApplied) {
  log('  Every non-zero band total here also cleared the gate, so this run did not')
  log('  happen to observe the dead zone. The offline guard covers it.')
}

log('')
if (failures) {
  log(`${failures} failure(s).`)
  process.exit(1)
}
log('Open-Meteo end-to-end verified.')
