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
import { weatherDramaModifier } from '../src/data/weatherDrama.js'

mkdirSync('outbox', { recursive: true })
const stamp = new Date().toISOString().replace(/[:.]/g, '-')
const outPath = 'outbox/open-meteo-e2e-' + stamp + '.txt'
const out = []
const log = s => { out.push(s); console.log(s); try { writeFileSync(outPath, out.join('\n')) } catch {} }

const OM = 'https://api.open-meteo.com/v1/forecast'
const AQ = 'https://air-quality-api.open-meteo.com/v1/air-quality'
const CURRENT = 'temperature_2m,precipitation,rain,snowfall,is_day,wind_speed_10m,wind_direction_10m'

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

  // Fields the app actually reads.
  for (const f of ['temperature_2m', 'rain', 'snowfall', 'wind_speed_10m', 'precipitation', 'is_day']) {
    ok(`field ${f} present`, f in c, `= ${JSON.stringify(c[f])}`)
  }

  // THE UNITS. Every weatherDramaModifier threshold depends on these.
  ok('temperature unit is Fahrenheit', u.temperature_2m === '°F', `got ${JSON.stringify(u.temperature_2m)}`)
  ok('wind unit is mph', u.wind_speed_10m === 'mp/h', `got ${JSON.stringify(u.wind_speed_10m)}`)
  ok('rain unit is mm', u.rain === 'mm', `got ${JSON.stringify(u.rain)}`)
  ok('snowfall unit is cm or mm (recorded, not assumed)',
     u.snowfall === 'cm' || u.snowfall === 'mm', `got ${JSON.stringify(u.snowfall)}`)

  let aqi = null
  try {
    const ares = await fetch(`${AQ}?latitude=${v.lat}&longitude=${v.lon}&current=us_aqi`)
    ok('air-quality HTTP 200', ares.ok, `status ${ares.status}`)
    if (ares.ok) {
      const aj = await ares.json()
      aqi = aj?.current?.us_aqi ?? null
      ok('us_aqi present and numeric', typeof aqi === 'number', `= ${JSON.stringify(aqi)}`)
    }
  } catch (e) {
    failures++
    log(`  FAIL  air-quality threw: ${String(e).slice(0, 120)}`)
  }

  // The shipped modifier, on real returned values.
  const wx = {
    tempF: c.temperature_2m,
    windMph: c.wind_speed_10m,
    rainMm: c.rain,
    snowMm: c.snowfall,
    aqi,
  }
  const { delta, reasons } = weatherDramaModifier(wx)
  log(`  live: ${Math.round(wx.tempF)}°F  ${wx.windMph}mph  rain ${wx.rainMm}  snow ${wx.snowMm}  AQI ${aqi}`)
  log(`  weatherDramaModifier -> ${delta > 0 ? '+' : ''}${delta}${reasons.length ? '  (' + reasons.join(', ') + ')' : '  (no band met)'}`)
  ok('delta is a finite number, never NaN', Number.isFinite(delta), `= ${delta}`)
  results.push({ venue: v.venue, delta, reasons, wx })
  log('')
}

log('=== SUMMARY ===')
for (const r of results) {
  log(`  ${r.venue.padEnd(16)} ${(r.delta > 0 ? '+' : '') + r.delta}  ${r.reasons.join(', ') || '(none)'}`)
}
const anyNonZero = results.some(r => r.delta !== 0)
log('')
log(anyNonZero
  ? '  At least one venue met a band, so the positive path is exercised on real data.'
  : '  Every venue scored 0. That is a REAL RESULT, not a failure -- calm weather')
if (!anyNonZero) {
  log('  everywhere means no band was met. It does mean this run did not exercise')
  log('  any band end to end; the offline guard covers those.')
}

log('')
if (failures) {
  log(`${failures} failure(s).`)
  process.exit(1)
}
log('Open-Meteo end-to-end verified.')
