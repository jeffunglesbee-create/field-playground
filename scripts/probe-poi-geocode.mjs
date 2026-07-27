// Does a real POI source resolve stadium coordinates, and does it agree
// with production's hand-verified table?
//
// Scored on DISTANCE, not on whether a result came back. A geocoder
// returning a plausible-but-wrong point is worse than one returning
// nothing -- coords off ~10 miles were already found in this repo today,
// and they render a perfectly believable temperature for the wrong city.
// Threshold: 0.02 deg (~2km), generous enough for a stadium centroid vs
// its street address, tight enough to catch a different city.
//
// ROUND 2 FIXES, all of them my own request bugs rather than findings:
//  1. Overpass returned HTTP 406 on all 8 -- it requires a User-Agent
//     and rejects requests without one BEFORE doing any lookup. Reporting
//     that 0/8 as "Overpass failed" would have repeated the exact error
//     this whole probe exists to correct: mistaking a tool-usage mistake
//     for a property of the tool.
//  2. Wikidata missed 'loanDepot park' (lowercase l, irregular casing)
//     because the query used an exact rdfs:label match. Added skos:altLabel
//     and a case-insensitive fallback to catch it -- a string-form
//     problem, never a coverage problem.
//  3. Added the roof property lookup (P5624 roof type / P1132-adjacent).
//     Chat claimed geocoding "structurally cannot know whether a stadium
//     has a dome." Wikidata is structured data, not a geocoder, so that
//     claim needs testing rather than assuming.
//
// ROUND 3 FIX, a real regression the round 2 fix itself introduced:
//  Round 2's case-insensitive fallback (`?item rdfs:label ?lbl. FILTER
//  (LCASE(STR(?lbl)) = LCASE("..."))`) ran UNCONDITIONALLY as one branch
//  of the query's UNION, for all 8 venues on every call -- not just
//  loanDepot park, the one venue it was added to catch. That FILTER is a
//  computed expression, not a bound value, so Wikidata's label index
//  can't answer it: it's a full scan of ~100M labelled entities before
//  the filter even runs. Against the public endpoint's query ceiling,
//  that's an 504 (server-side gateway timeout) on every single venue,
//  every run -- traded a cheap indexed lookup that worked for 7/8 venues
//  for an unbounded scan that broke all 8 chasing one miss. Fixed with a
//  two-tier lookup: a fast pass using only BOUND label/altLabel triples
//  (index-answerable), falling back to the expensive scan only for a
//  venue the fast pass actually misses -- so the scan's cost is now
//  proportional to how rarely it's needed (0-1 calls/run in practice),
//  not paid unconditionally by every venue regardless of whether it needs it.

import { mkdirSync, writeFileSync } from 'node:fs'

mkdirSync('outbox', { recursive: true })
const stamp = new Date().toISOString().replace(/[:.]/g, '-')
const out = []
const outPath = `outbox/poi-geocode-probe-${stamp}.txt`
// Flush after EVERY line, not at the end.
//
// Round 2 ran 6m04s against the workflow's 5-minute step timeout, was
// killed, and wrote nothing at all -- the job still reported success
// because the step carries continue-on-error. Identical failure to
// verify-reconciliation.mjs earlier today: batching output until the end
// means a timeout destroys the entire run's evidence. Incremental writes
// mean a killed run still leaves everything it had learned.
const log = s => {
  out.push(s)
  console.log(s)
  try { writeFileSync(outPath, out.join('\n')) } catch { /* best effort */ }
}

const UA = 'field-playground-probe/1.0 (github.com/jeffunglesbee-create/field-playground; research)'

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

async function wikidataQuery(q) {
  const url = 'https://query.wikidata.org/sparql?format=json&query=' + encodeURIComponent(q)
  const res = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'application/sparql-results+json' } })
  if (!res.ok) return { status: 'http_error', err: `HTTP ${res.status}` }
  const j = await res.json()
  const b = j?.results?.bindings?.[0]
  if (!b) return { status: 'no_match' }
  const m = /Point\(([-\d.]+) ([-\d.]+)\)/.exec(b.coord.value)
  if (!m) return { status: 'http_error', err: 'unparseable coord' }
  return { status: 'match', lat: parseFloat(m[2]), lon: parseFloat(m[1]), roof: b.roofLabel?.value ?? null }
}

// Two-tier: a fast pass using only BOUND label/altLabel triples (index-
// answerable, matches round 1's 7/8 performance), falling back to the
// expensive case-insensitive scan ONLY for a venue the fast pass actually
// missed. See the ROUND 3 FIX comment at the top of this file for why
// running the scan unconditionally broke all 8 venues instead of just
// catching loanDepot park.
async function wikidata(name) {
  const esc = name.replace(/"/g, '\\"')

  const fastQ = `
    SELECT ?item ?itemLabel ?coord ?roofLabel WHERE {
      {
        ?item rdfs:label "${esc}"@en .
      } UNION {
        ?item skos:altLabel "${esc}"@en .
      }
      ?item wdt:P625 ?coord .
      OPTIONAL { ?item wdt:P5624 ?roof . }
      SERVICE wikibase:label { bd:serviceParam wikibase:language "en". }
    } LIMIT 1`
  const fast = await wikidataQuery(fastQ)
  if (fast.status === 'match') return { lat: fast.lat, lon: fast.lon, roof: fast.roof, tier: 'fast' }
  if (fast.status === 'http_error') return { err: fast.err }

  const slowQ = `
    SELECT ?item ?itemLabel ?coord ?roofLabel WHERE {
      ?item rdfs:label ?lbl .
      FILTER(LANG(?lbl) = "en" && LCASE(STR(?lbl)) = LCASE("${esc}"))
      ?item wdt:P625 ?coord .
      OPTIONAL { ?item wdt:P5624 ?roof . }
      SERVICE wikibase:label { bd:serviceParam wikibase:language "en". }
    } LIMIT 1`
  const slow = await wikidataQuery(slowQ)
  if (slow.status === 'match') return { lat: slow.lat, lon: slow.lon, roof: slow.roof, tier: 'slow (unbounded scan)' }
  if (slow.status === 'http_error') return { err: slow.err }
  return { err: 'no match' }
}

// User-Agent added. Overpass rejects UA-less requests with 406 before
// running the query at all.
async function overpass(name) {
  const esc = name.replace(/"/g, '\\"')
  const q = `[out:json][timeout:10];
    (node["name"="${esc}"]["leisure"="stadium"];
     way["name"="${esc}"]["leisure"="stadium"];
     relation["name"="${esc}"]["leisure"="stadium"];
     way["name"="${esc}"]["building"="stadium"];
     relation["name"="${esc}"]["building"="stadium"];);
    out center 1;`
  const res = await fetch('https://overpass-api.de/api/interpreter', {
    method: 'POST',
    body: 'data=' + encodeURIComponent(q),
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'User-Agent': UA,
      Accept: 'application/json',
    },
  })
  if (!res.ok) return { err: `HTTP ${res.status}` }
  const j = await res.json()
  const el = j?.elements?.[0]
  if (!el) return { err: 'no match' }
  const lat = el.lat ?? el.center?.lat
  const lon = el.lon ?? el.center?.lon
  if (lat == null) return { err: 'no coord' }
  const t = el.tags ?? {}
  // Report whatever roof-ish tag actually exists; invent nothing.
  const roof = t['roof:shape'] ?? t['building:roof'] ?? t.roof ?? null
  return { lat, lon, roof }
}

// ROUND 4 ADDITION: chat's reframe of the whole approach -- round 3's
// two-tier fix (above) solved the immediate reliability problem (0/8 ->
// 8/8) but is still fundamentally a LOOKUP: one Wikidata query per venue.
// Fine at 8 venues, doesn't scale to VENUE_COORDS's real ~98 entries, and
// structurally can't discover a venue that isn't already a key in TRUTH.
//
// Chat's point: this was a JOIN problem, not a lookup problem. Ask
// Wikidata once for "every venue of this TYPE, with coordinates and every
// English alias," bounded by an indexed P31/P279* path rather than by
// name -- a few hundred rows, not a scan -- then do all the fuzzy/
// case-insensitive/alias matching locally in JS against that small
// in-memory set, where it's free and deterministic. Run alongside the
// already-verified per-venue lookup above, not replacing it, so this is
// a real side-by-side comparison rather than a swap taken on faith.
//
// The type QID below came from chat, not independently verified (this
// sandbox can't reach Wikidata either) -- so this queries the QID's OWN
// English label first and prints it. If that label doesn't read like
// "baseball venue"/"ballpark"/similar, the ID is wrong and everything
// below should be read as "queried the wrong type," not "Wikidata lacks
// this data."
const TYPE_QID = 'Q1076486'

function normalizeName(s) {
  return s
    .toLowerCase()
    .normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

async function verifyTypeQid() {
  const q = `SELECT ?label WHERE { wd:${TYPE_QID} rdfs:label ?label . FILTER(LANG(?label) = "en") } LIMIT 1`
  const url = 'https://query.wikidata.org/sparql?format=json&query=' + encodeURIComponent(q)
  const res = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'application/sparql-results+json' } })
  if (!res.ok) return { err: `HTTP ${res.status}` }
  const j = await res.json()
  const label = j?.results?.bindings?.[0]?.label?.value
  return label ? { label } : { err: 'no label found for this QID -- likely wrong or deleted' }
}

async function fetchAllVenuesByType() {
  const q = `
    SELECT ?venue ?venueLabel ?altLabel ?coord ?roofLabel WHERE {
      ?venue wdt:P31/wdt:P279* wd:${TYPE_QID} ;
             wdt:P625 ?coord .
      OPTIONAL { ?venue skos:altLabel ?altLabel . FILTER(LANG(?altLabel) = "en") }
      OPTIONAL { ?venue wdt:P5624 ?roof . }
      SERVICE wikibase:label { bd:serviceParam wikibase:language "en". }
    }`
  const url = 'https://query.wikidata.org/sparql?format=json&query=' + encodeURIComponent(q)
  const res = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'application/sparql-results+json' } })
  if (!res.ok) return { err: `HTTP ${res.status}` }
  const j = await res.json()
  return { rows: j?.results?.bindings ?? [] }
}

// One row per (venue, altLabel) pair -- fold back to one entry per venue,
// with every name (preferred label + all altLabels) as a lookup key.
function buildLocalIndex(rows) {
  const byVenue = new Map()
  for (const row of rows) {
    const uri = row.venue.value
    const m = /Point\(([-\d.]+) ([-\d.]+)\)/.exec(row.coord?.value ?? '')
    if (!m) continue
    let entry = byVenue.get(uri)
    if (!entry) {
      entry = {
        lat: parseFloat(m[2]),
        lon: parseFloat(m[1]),
        roof: row.roofLabel?.value ?? null,
        label: row.venueLabel?.value ?? uri,
        names: new Set(),
      }
      byVenue.set(uri, entry)
    }
    if (row.venueLabel?.value) entry.names.add(row.venueLabel.value)
    if (row.altLabel?.value) entry.names.add(row.altLabel.value)
  }
  const index = new Map()
  for (const entry of byVenue.values()) {
    for (const name of entry.names) index.set(normalizeName(name), entry)
  }
  return { index, venueCount: byVenue.size, rowCount: rows.length }
}

async function main() {
  log(`probe_at: ${new Date().toISOString()}`)
  log(`threshold: ${OK} deg (~2km) from production's hand-verified coords`)
  log(`round 3: Overpass User-Agent added, Wikidata two-tier (fast indexed pass, unbounded scan only on miss), roof property queried`)
  log('')
  const score = { wikidata: 0, overpass: 0, total: 0, roofW: 0, roofO: 0 }

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
      if (w.roof) score.roofW++
      log(`    wikidata: ${w.lat.toFixed(4)}, ${w.lon.toFixed(4)}  delta ${d.toFixed(4)}  ${pass ? 'MATCH' : 'WRONG'}${w.roof ? `  | roof: ${w.roof}` : '  | roof: (none)'}  [${w.tier}]`)
    }

    let o
    try { o = await overpass(name) } catch (e) { o = { err: String(e).slice(0, 60) } }
    if (o.err) log(`    overpass: MISS (${o.err})`)
    else {
      const d = dist(o.lat, o.lon, tlat, tlon)
      const pass = d <= OK
      if (pass) score.overpass++
      if (o.roof) score.roofO++
      log(`    overpass: ${o.lat.toFixed(4)}, ${o.lon.toFixed(4)}  delta ${d.toFixed(4)}  ${pass ? 'MATCH' : 'WRONG'}${o.roof ? `  | roof tag: ${o.roof}` : '  | roof tag: (none)'}`)
    }

    await new Promise(r => setTimeout(r, 800))
  }

  log('')
  log(`RESULT  wikidata ${score.wikidata}/${score.total}   overpass ${score.overpass}/${score.total}`)
  log(`roof info returned:  wikidata ${score.roofW}/${score.total}   overpass ${score.roofO}/${score.total}`)
  log(`baseline: Open-Meteo geocoding 1/8 -- a populated-places index, not a POI index.`)

  log('')
  log('--- ROUND 4: inverted single-query lookup (chat\'s reframe, side-by-side vs. the per-venue lookup above) ---')

  let qidCheck
  try { qidCheck = await verifyTypeQid() } catch (e) { qidCheck = { err: String(e).slice(0, 60) } }
  if (qidCheck.err) {
    log(`type QID ${TYPE_QID}: FAILED (${qidCheck.err}) -- can't run the inverted query without knowing what this ID even is`)
  } else {
    log(`type QID ${TYPE_QID} label: "${qidCheck.label}" -- read this before trusting anything below; if it doesn't say something like "baseball venue" the rest of this section queried the wrong type`)

    let all
    try { all = await fetchAllVenuesByType() } catch (e) { all = { err: String(e).slice(0, 60) } }
    if (all.err) {
      log(`single query: FAILED (${all.err})`)
    } else {
      const { index, venueCount, rowCount } = buildLocalIndex(all.rows)
      log(`single query returned ${rowCount} rows -> ${venueCount} distinct venues (one query, not ${score.total})`)
      log('')

      const invScore = { match: 0, total: 0, roof: 0 }
      for (const [name, [tlat, tlon]] of Object.entries(TRUTH)) {
        invScore.total++
        const entry = index.get(normalizeName(name))
        if (!entry) {
          log(`--- ${name}: MISS (no local match among ${venueCount} venues -- either wrong type, or this venue genuinely isn't in this Wikidata class)`)
          continue
        }
        const d = dist(entry.lat, entry.lon, tlat, tlon)
        const pass = d <= OK
        if (pass) invScore.match++
        if (entry.roof) invScore.roof++
        log(`--- ${name}: ${entry.lat.toFixed(4)}, ${entry.lon.toFixed(4)}  delta ${d.toFixed(4)}  ${pass ? 'MATCH' : 'WRONG'}${entry.roof ? `  | roof: ${entry.roof}` : '  | roof: (none)'}  (matched via "${entry.label}")`)
      }

      log('')
      log(`INVERTED RESULT  ${invScore.match}/${invScore.total} matched locally, ${venueCount} total venues available from the single query (roof info: ${invScore.roof}/${invScore.total})`)
      log(`This is the real test of chat's claim: one query today returned ${venueCount} venues total -- ${venueCount - invScore.total} more than the ${invScore.total} this probe happens to check against. Whether that's a usable basis for regenerating VENUE_COORDS (~98 real entries, MLB alone is ~30 parks) is a separate decision from whether this query mechanism works.`)
    }
  }
}

main().catch(e => {
  log('FAILED: ' + String(e))
})
