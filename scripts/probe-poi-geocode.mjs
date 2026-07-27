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
//
// ROUND 6 ADDITION: a simple cache for Nominatim specifically. Its usage
// policy (operations.osmfoundation.org/policies/nominatim/) requires it:
// "Results must be cached on your side. Clients sending repeatedly the
// same query may be classified as faulty and blocked." Stadium
// coordinates don't move -- there's no reason a re-run of this probe
// should ask Nominatim the same 8 questions again within any reasonable
// window. Cache lives at outbox/poi-geocode-cache.json, committed
// alongside the probe results by the same workflow step, so it persists
// across separate GitHub Actions runs (the runner itself is ephemeral,
// the repo isn't). TTL is 30 days -- long, deliberately: this is
// physical geography, not live data, so staleness isn't really a risk
// the way it would be for weather. Only successful results are cached; a
// transient 429/504 is never treated as a real answer worth remembering.

import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs'

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

const CACHE_PATH = 'outbox/poi-geocode-cache.json'
const CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000

function loadCache() {
  if (!existsSync(CACHE_PATH)) return {}
  try { return JSON.parse(readFileSync(CACHE_PATH, 'utf8')) } catch { return {} }
}
function saveCache(cache) {
  try { writeFileSync(CACHE_PATH, JSON.stringify(cache, null, 2)) } catch { /* best effort */ }
}
const cache = loadCache()

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

// ROUND 5 ADDITION: a third free source. Nominatim is OSM's own official
// name-search geocoder (nominatim.openstreetmap.org) -- distinct
// infrastructure from the Overpass interpreter above, even though both
// ultimately read the same underlying OSM tag data, so it's a genuinely
// different reliability profile, not just another way to ask Overpass
// the same question. extratags=1 surfaces the same roof:shape-style tags
// Overpass returns, through a different endpoint -- a second, independent
// chance to confirm (or fail to confirm) the one real roof hit found so
// far (Tropicana Field, via Overpass).
//
// Usage policy (operations.osmfoundation.org/policies/nominatim), read
// before writing this, not assumed: max 1 request/second, a real
// identifying User-Agent (already have one), attribution required (see
// the log line in main()), and explicit allowance for "smaller one-time
// bulk tasks" like this 8-request probe -- this is NOT a scheduled job
// and won't become one without revisiting this policy.
let lastNominatimAt = 0
async function nominatim(name) {
  const waitMs = Math.max(0, 1100 - (Date.now() - lastNominatimAt))
  if (waitMs > 0) await new Promise(r => setTimeout(r, waitMs))
  lastNominatimAt = Date.now()

  const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(name)}&format=jsonv2&limit=1&extratags=1`
  const res = await fetch(url, { headers: { 'User-Agent': UA } })
  if (!res.ok) return { err: `HTTP ${res.status}` }
  const j = await res.json()
  const hit = j?.[0]
  if (!hit) return { err: 'no match' }
  const lat = parseFloat(hit.lat)
  const lon = parseFloat(hit.lon)
  if (Number.isNaN(lat) || Number.isNaN(lon)) return { err: 'unparseable coord' }
  const extratags = hit.extratags ?? {}
  const roof = extratags['roof:shape'] ?? extratags['building:roof'] ?? extratags.roof ?? null
  return { lat, lon, roof, osmType: hit.type ?? null, osmClass: hit.class ?? null }
}

// Cache wrapper -- only successful results are stored, so a transient
// 429/504 never gets remembered as if it were a real answer, and next
// run tries the network again instead of replaying a failure forever.
async function nominatimCached(name) {
  const key = `nominatim:${name}`
  const hit = cache[key]
  if (hit && Date.now() - hit.cachedAt < CACHE_TTL_MS) {
    return { ...hit.result, fromCache: true }
  }
  const result = await nominatim(name)
  if (!result.err) {
    cache[key] = { result, cachedAt: Date.now() }
    saveCache(cache)
  }
  return result
}

// ROUND 7 ADDITION: a fourth free source. Photon (photon.komoot.io) is
// built on the same underlying OSM data as Overpass/Nominatim (an
// Elasticsearch index over it) but is a genuinely different piece of
// software with its own infra, and was chat's own original suggestion
// (first message in this whole thread) for better fuzzy/typo-tolerant
// name matching than Nominatim -- "Globe Life Field" vs "Globe Life
// Park." So this is primarily a test of MATCHING reliability under messy
// names, not a new source of roof data: Photon's `extra` tags field is
// only populated if the server operator configured `-extra-tags` at
// index-build time (confirmed via Photon's own docs, not assumed) --
// whether komoot's public instance did that for roof:shape is unknown
// until actually queried, so this checks for it defensively rather than
// expecting it.
//
// No published hard rate limit from komoot ("reasonable use... extensive
// usage will be throttled or banned"), so this follows the same
// convention the community-maintained R client for this exact public
// instance defaults to: 1 request/second. No key required. Note the
// coordinate order in Photon's GeoJSON response is [lon, lat], the
// opposite of Nominatim's lat/lon fields -- easy to get backwards.
let lastPhotonAt = 0
async function photon(name) {
  const waitMs = Math.max(0, 1100 - (Date.now() - lastPhotonAt))
  if (waitMs > 0) await new Promise(r => setTimeout(r, waitMs))
  lastPhotonAt = Date.now()

  const url = `https://photon.komoot.io/api/?q=${encodeURIComponent(name)}&limit=1`
  const res = await fetch(url, { headers: { 'User-Agent': UA } })
  if (!res.ok) return { err: `HTTP ${res.status}` }
  const j = await res.json()
  const feat = j?.features?.[0]
  if (!feat) return { err: 'no match' }
  const coords = feat.geometry?.coordinates
  if (!Array.isArray(coords) || coords.length < 2) return { err: 'unparseable coord' }
  const [lon, lat] = coords
  const props = feat.properties ?? {}
  const extra = props.extra ?? {}
  const roof = extra['roof:shape'] ?? extra['building:roof'] ?? extra.roof ?? null
  return { lat, lon, roof, osmKey: props.osm_key ?? null, osmValue: props.osm_value ?? null }
}

async function photonCached(name) {
  const key = `photon:${name}`
  const hit = cache[key]
  if (hit && Date.now() - hit.cachedAt < CACHE_TTL_MS) {
    return { ...hit.result, fromCache: true }
  }
  const result = await photon(name)
  if (!result.err) {
    cache[key] = { result, cachedAt: Date.now() }
    saveCache(cache)
  }
  return result
}

// ROUND 8 ADDITION: every round so far filtered roof lookups down to 2-3
// candidate keys (roof:shape, building:roof, roof) before checking. That's
// an assumption, not a finding -- if retractable-roof data exists under
// some OTHER key, filtering to those 3 would silently hide it and make
// "0/8" look like "no data" when it's really "wrong key guessed." This
// dumps the COMPLETE, unfiltered raw tag set for the two retractable-roof
// venues in TRUTH (Globe Life Field, loanDepot park) from both Overpass
// and Nominatim, so the question "is roof data available elsewhere"
// gets answered by reading everything that's actually there, not by
// re-running the same narrow key check again.
async function overpassRawTags(name) {
  const esc = name.replace(/"/g, '\\"')
  const q = `[out:json][timeout:10];
    (node["name"="${esc}"]["leisure"="stadium"];
     way["name"="${esc}"]["leisure"="stadium"];
     relation["name"="${esc}"]["leisure"="stadium"];
     way["name"="${esc}"]["building"="stadium"];
     relation["name"="${esc}"]["building"="stadium"];);
    out tags 1;`
  const res = await fetch('https://overpass-api.de/api/interpreter', {
    method: 'POST',
    body: 'data=' + encodeURIComponent(q),
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': UA, Accept: 'application/json' },
  })
  if (!res.ok) return { err: `HTTP ${res.status}` }
  const j = await res.json()
  const el = j?.elements?.[0]
  if (!el) return { err: 'no match' }
  return { tags: el.tags ?? {} }
}

async function nominatimRawExtratags(name) {
  const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(name)}&format=jsonv2&limit=1&extratags=1`
  const res = await fetch(url, { headers: { 'User-Agent': UA } })
  if (!res.ok) return { err: `HTTP ${res.status}` }
  const j = await res.json()
  const hit = j?.[0]
  if (!hit) return { err: 'no match' }
  return { tags: hit.extratags ?? {} }
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
  log(`round 5: adds Nominatim as a third free source (nominatim.openstreetmap.org, distinct infra from Overpass, extratags roof lookup)`)
  log(`round 6: Nominatim results now cached (outbox/poi-geocode-cache.json, 30-day TTL) per its usage policy's caching requirement`)
  log(`round 7: adds Photon as a fourth free source (photon.komoot.io, OSM-backed but distinct infra, chat's own original pick for fuzzy name matching), also cached`)
  log(`attribution: Nominatim + Photon results (c) OpenStreetMap contributors, ODbL -- https://www.openstreetmap.org/copyright`)
  log('')
  const score = { wikidata: 0, overpass: 0, nominatim: 0, photon: 0, total: 0, roofW: 0, roofO: 0, roofN: 0, roofP: 0, nominatimCacheHits: 0, photonCacheHits: 0 }

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

    let n
    try { n = await nominatimCached(name) } catch (e) { n = { err: String(e).slice(0, 60) } }
    if (n.err) log(`    nominatim: MISS (${n.err})`)
    else {
      const d = dist(n.lat, n.lon, tlat, tlon)
      const pass = d <= OK
      if (pass) score.nominatim++
      if (n.roof) score.roofN++
      if (n.fromCache) score.nominatimCacheHits++
      log(`    nominatim: ${n.lat.toFixed(4)}, ${n.lon.toFixed(4)}  delta ${d.toFixed(4)}  ${pass ? 'MATCH' : 'WRONG'}${n.roof ? `  | roof tag: ${n.roof}` : '  | roof tag: (none)'}  [${n.osmClass ?? '?'}/${n.osmType ?? '?'}]${n.fromCache ? '  (cached)' : ''}`)
    }

    let p
    try { p = await photonCached(name) } catch (e) { p = { err: String(e).slice(0, 60) } }
    if (p.err) log(`    photon: MISS (${p.err})`)
    else {
      const d = dist(p.lat, p.lon, tlat, tlon)
      const pass = d <= OK
      if (pass) score.photon++
      if (p.roof) score.roofP++
      if (p.fromCache) score.photonCacheHits++
      log(`    photon: ${p.lat.toFixed(4)}, ${p.lon.toFixed(4)}  delta ${d.toFixed(4)}  ${pass ? 'MATCH' : 'WRONG'}${p.roof ? `  | roof tag: ${p.roof}` : '  | roof tag: (none)'}  [${p.osmKey ?? '?'}/${p.osmValue ?? '?'}]${p.fromCache ? '  (cached)' : ''}`)
    }

    await new Promise(r => setTimeout(r, 800))
  }

  log('')
  log(`RESULT  wikidata ${score.wikidata}/${score.total}   overpass ${score.overpass}/${score.total}   nominatim ${score.nominatim}/${score.total}   photon ${score.photon}/${score.total}`)
  log(`cache hits:  nominatim ${score.nominatimCacheHits}/${score.total}   photon ${score.photonCacheHits}/${score.total}`)
  log(`roof info returned:  wikidata ${score.roofW}/${score.total}   overpass ${score.roofO}/${score.total}   nominatim ${score.roofN}/${score.total}   photon ${score.roofP}/${score.total}`)
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

  log('')
  log('--- ROUND 8: raw, unfiltered tag dump for retractable-roof venues -- is roof data available under a key none of the rounds above checked for? ---')
  const RETRACTABLE_VENUES = ['Globe Life Field', 'loanDepot park']
  for (const name of RETRACTABLE_VENUES) {
    log(`--- ${name} ---`)

    let ot
    try { ot = await overpassRawTags(name) } catch (e) { ot = { err: String(e).slice(0, 60) } }
    if (ot.err) log(`    overpass raw tags: FAILED (${ot.err})`)
    else log(`    overpass raw tags: ${JSON.stringify(ot.tags)}`)

    let nt
    try { nt = await nominatimRawExtratags(name) } catch (e) { nt = { err: String(e).slice(0, 60) } }
    if (nt.err) log(`    nominatim extratags: FAILED (${nt.err})`)
    else log(`    nominatim extratags: ${JSON.stringify(nt.tags)}`)

    await new Promise(r => setTimeout(r, 800))
  }
  log('')
  log('Read the raw tag dumps above by hand: if no key anywhere in them encodes')
  log('retractability (movable/operable/convertible roof, not just shape), that is')
  log('real evidence this is an OSM data-completeness gap for these two venues')
  log('specifically, not a wrong-key-guessed bug in this probe -- roof:shape=* is a')
  log('~30-value catalogue of GEOMETRIC shapes (dome, gabled, hipped, flat, ...) per')
  log('OSM\'s own wiki, with no documented value for "retractable" as a mechanical')
  log('property, which is a plausible root cause independent of source or query.')
}

main().catch(e => {
  log('FAILED: ' + String(e))
})
