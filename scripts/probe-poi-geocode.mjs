// Does a real POI source resolve stadium coordinates, and does it agree
// with production's hand-verified table?
//
// Scored on DISTANCE, not on whether a result came back. A geocoder
// returning a plausible-but-wrong point is worse than one returning
// nothing -- coords off ~10 miles were already found in this repo today,
// and they render a perfectly believable temperature for the wrong city.
// Threshold: 0.02 deg (~2km), generous enough for a stadium centroid vs
// its street address, tight enough to catch a different city.

import { mkdirSync, writeFileSync } from 'node:fs'

mkdirSync('outbox', { recursive: true })
const stamp = new Date().toISOString().replace(/[:.]/g, '-')
const out = []
const log = s => { out.push(s); console.log(s) }

// Ground truth: production's own hand-verified entries, the ones the
// table would have to beat. Deliberately mixed -- open, retractable and
// dome -- so roof-type recovery is testable too.
const TRUTH = {
  'Comerica Park':      [42.3390, -83.0485, 'open'],
  'Citizens Bank Park': [39.9061, -75.1665, 'open'],
  'Globe Life Field':   [32.7473, -97.0847, 'retractable'],
  'Tropicana Field':    [27.7682, -82.6534, 'dome'],
  'Fenway Park':        [42.3467, -71.0972, 'open'],
  'Oracle Park':        [37.7786, -122.3893, 'open'],
  'loanDepot park':     [25.7781, -80.2197, 'retractable'],
  'Yankee Stadium':     [40.8296, -73.9262, 'open'],
}

const dist = (a, b, c, d) => Math.sqrt((a - c) ** 2 + (b - d) ** 2)
const OK = 0.02

async function wikidata(name) {
  // P625 = coordinate location. Also pulls P1329-adjacent roof info via
  // P5023 (structure replaced) is unreliable; instead ask for the
  // "has use"/roof-ish qualifiers that commonly exist, tolerating absence.
  const q = `
    SELECT ?item ?itemLabel ?coord WHERE {
      ?item rdfs:label "${name}"@en .
      ?item wdt:P625 ?coord .
      SERVICE wikibase:label { bd:serviceParam wikibase:language "en". }
    } LIMIT 1`
  const url = 'https://query.wikidata.org/sparql?format=json&query=' + encodeURIComponent(q)
  const res = await fetch(url, { headers: { 'User-Agent': 'field-playground-probe/1.0 (research)' } })
  if (!res.ok) return { err: `HTTP ${res.status}` }
  const j = await res.json()
  const b = j?.results?.bindings?.[0]
  if (!b) return { err: 'no match' }
  const m = /Point\(([-\d.]+) ([-\d.]+)\)/.exec(b.coord.value)
  if (!m) return { err: 'unparseable coord' }
  return { lat: parseFloat(m[2]), lon: parseFloat(m[1]) }
}

async function overpass(name) {
  // leisure=stadium by name. `out center` returns a centroid for ways
  // and relations, which is what a stadium footprint actually is.
  const q = `[out:json][timeout:25];
    (node["name"="${name}"]["leisure"="stadium"];
     way["name"="${name}"]["leisure"="stadium"];
     relation["name"="${name}"]["leisure"="stadium"];
     node["name"="${name}"]["building"="stadium"];
     way["name"="${name}"]["building"="stadium"];);
    out center 1;`
  const res = await fetch('https://overpass-api.de/api/interpreter', {
    method: 'POST',
    body: 'data=' + encodeURIComponent(q),
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  })
  if (!res.ok) return { err: `HTTP ${res.status}` }
  const j = await res.json()
  const el = j?.elements?.[0]
  if (!el) return { err: 'no match' }
  const lat = el.lat ?? el.center?.lat
  const lon = el.lon ?? el.center?.lon
  if (lat == null) return { err: 'no coord' }
  // OSM tags roof:shape / building:levels etc. Report whatever roof-ish
  // tag exists rather than inventing one.
  const roof = el.tags?.['roof:shape'] ?? el.tags?.['building:part'] ?? null
  return { lat, lon, roof }
}

async function main() {
  log(`probe_at: ${new Date().toISOString()}`)
  log(`threshold: ${OK} deg (~2km) from production's hand-verified coords`)
  log('')
  const score = { wikidata: 0, overpass: 0, total: 0 }

  for (const [name, [tlat, tlon, roof]] of Object.entries(TRUTH)) {
    score.total++
    log(`--- ${name}  (truth ${tlat}, ${tlon} | ${roof})`)

    let w
    try { w = await wikidata(name) } catch (e) { w = { err: String(e).slice(0, 60) } }
    if (w.err) log(`    wikidata: MISS (${w.err})`)
    else {
      const d = dist(w.lat, w.lon, tlat, tlon)
      const pass = d <= OK
      if (pass) score.wikidata++
      log(`    wikidata: ${w.lat.toFixed(4)}, ${w.lon.toFixed(4)}  delta ${d.toFixed(4)}  ${pass ? 'MATCH' : 'WRONG'}`)
    }

    let o
    try { o = await overpass(name) } catch (e) { o = { err: String(e).slice(0, 60) } }
    if (o.err) log(`    overpass: MISS (${o.err})`)
    else {
      const d = dist(o.lat, o.lon, tlat, tlon)
      const pass = d <= OK
      if (pass) score.overpass++
      log(`    overpass: ${o.lat.toFixed(4)}, ${o.lon.toFixed(4)}  delta ${d.toFixed(4)}  ${pass ? 'MATCH' : 'WRONG'}${o.roof ? ` | roof tag: ${o.roof}` : ''}`)
    }

    await new Promise(r => setTimeout(r, 1200)) // be a good citizen
  }

  log('')
  log(`RESULT  wikidata ${score.wikidata}/${score.total}   overpass ${score.overpass}/${score.total}`)
  log(`(Open-Meteo geocoding scored 1/8 on this same class of name —`)
  log(` a populated-places index, not a POI index.)`)
  writeFileSync(`outbox/poi-geocode-probe-${stamp}.txt`, out.join('\n'))
}

main().catch(e => {
  log('FAILED: ' + String(e))
  writeFileSync(`outbox/poi-geocode-probe-${stamp}.txt`, out.join('\n'))
  process.exitCode = 1
})
