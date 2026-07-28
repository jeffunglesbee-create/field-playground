// Can Wikipedia lead sentences classify stadium roof type?
//
// WHY THIS EXISTS: four structured POI sources (Wikidata, Overpass,
// Nominatim, Photon) all returned 0/8 or 1/8 on roof info. Round 8 of
// that probe dumped complete unfiltered tag sets and found the real
// reason: OSM's `roof:shape=*` is a ~30-value catalogue of GEOMETRIC
// shapes (dome, gabled, hipped, flat) with no value for "retractable",
// which is a MECHANICAL property. The concept isn't modelled anywhere
// structured. But Wikipedia's prose states it plainly.
//
// WHY LEAD SENTENCE ONLY, not the article: the same probe surfaced
// these, from the same articles --
//    "The new stadium WAS TO BE constructed ... and have a retractable roof"
//    "the Rangers PROPOSED that their new ballpark be constructed with a
//     retractable roof"
// Regexing full article text matches proposals, abandoned plans, and
// descriptions of OTHER stadiums. A venue proposed with a roof but built
// without one would be classified wrong, confidently. Wikipedia's Manual
// of Style requires the FIRST SENTENCE to define what the subject IS, in
// present tense -- that convention is the whole basis for this working,
// so the probe must respect it rather than grep the lot.
//
// NOT A RUNTIME MECHANISM. Prose parsing is a heuristic: brittle to
// rewording, silently wrong when it fails. This is a TABLE GENERATOR --
// run once in CI, emit proposed roofType for review, freeze the result
// as a constant. Coordinates come from Nominatim (structured, 8/8,
// trustworthy live); roof type comes from here (generated, reviewed).
// Two different reliability needs, two different mechanisms.

import { mkdirSync, writeFileSync, readFileSync } from 'node:fs'

mkdirSync('outbox', { recursive: true })
const stamp = new Date().toISOString().replace(/[:.]/g, '-')
const outPath = `outbox/wikipedia-roof-probe-${stamp}.txt`
const out = []
// Flush every line. Two scripts today were killed by step timeouts and
// wrote nothing because output was batched until the end.
const log = s => {
  out.push(s); console.log(s)
  try { writeFileSync(outPath, out.join('\n')) } catch {}
}

// TASK 3: review artifact, not a live mechanism. A human reads this diff
// before it touches src/data/weather.js -- this script never writes to
// weather.js itself. Same incremental-flush discipline as the .txt log
// above: written after every venue, not just at the end.
const REVIEW_PATH = 'outbox/roof-type-proposed.json'
const proposedRows = []
const flushReview = () => {
  try { writeFileSync(REVIEW_PATH, JSON.stringify(proposedRows, null, 2)) } catch {}
}

// Established already, not rediscovered here: both venues' Wikipedia lead
// sentences omit the roof entirely -- BC Place's names the stadium as
// "multi-purpose" without mentioning retractability, and Marvel Stadium
// resolves under its former name (Docklands Stadium) whose lead sentence
// is purely locational. Neither is a parsing bug; both are articles whose
// first sentence doesn't state the fact this heuristic depends on. Flagged
// here so a reviewer sees them as known limits, not new surprises.
const KNOWN_UNFIXABLE = new Map([
  ['BC Place', 'Lead sentence omits roof type entirely ("multi-purpose stadium"); venue is genuinely retractable.'],
  ['Marvel Stadium', 'Resolves under its former name (Docklands Stadium); that lead sentence is purely locational and omits roof type; venue is genuinely retractable.'],
])

const UA = 'field-playground-probe/1.0 (github.com/jeffunglesbee-create/field-playground; research)'

// Ground truth parsed from the live table, so this can't drift from it.
// Captures lat/lon too, not just roofType -- TASK 2's coordinate gating
// (below) needs the table's own coordinates to verify a variant match
// against, not just its roofType.
function loadVenues() {
  const s = readFileSync('src/data/weather.js', 'utf-8')
  const re = /'([^']+)':\s*\[\s*(-?[\d.]+),\s*(-?[\d.]+),\s*'(open|retractable|dome)'/g
  const rows = []
  let m
  while ((m = re.exec(s)) !== null) {
    rows.push({ name: m[1], lat: parseFloat(m[2]), lon: parseFloat(m[3]), truth: m[4] })
  }
  return rows
}

// Same threshold, same distance formula as scripts/probe-poi-geocode.mjs
// -- reused deliberately, not reinvented, per the CC-CMD instruction:
// "it is the same question that probe already answered."
const dist = (a, b, c, d) => Math.sqrt((a - c) ** 2 + (b - d) ** 2)
const COORD_OK = 0.02

// First sentence only. Naive split on ". " breaks on "St. Louis" and
// "Inc.", so require the period be followed by a capital and preceded by
// something that isn't a known abbreviation-ish single token.
function firstSentence(text) {
  if (!text) return ''
  const m = /^(.*?[.!?])\s+[A-Z]/.exec(text)
  let s = m ? m[1] : text
  // Guard the common false split: "... in St. Louis, Missouri."
  const abbr = /\b(St|Mt|Ft|Inc|Co|U\.S|No)\.$/
  if (abbr.test(s) && m) {
    const m2 = /^(.*?[.!?])\s+[A-Z].*?([.!?])\s+[A-Z]/.exec(text)
    if (m2) s = text.slice(0, m2[0].lastIndexOf(m2[2]) + 1)
  }
  return s.trim()
}

function classify(sentence) {
  const s = sentence.toLowerCase()
  // Order matters: "retractable" must win before "roof"/"dome" generic.
  if (/retractable[- ]roof|retractable roof|roof that retracts/.test(s)) return 'retractable'
  if (/\bdomed\b|\bdome\b|fixed roof|enclosed stadium|indoor stadium/.test(s)) return 'dome'
  return 'open'
}

async function summary(title) {
  const url = 'https://en.wikipedia.org/api/rest_v1/page/summary/' + encodeURIComponent(title)
  const res = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'application/json' } })
  if (res.status === 429) return { err: 'HTTP 429', rateLimited: true }
  if (!res.ok) return { err: `HTTP ${res.status}` }
  const j = await res.json()
  if (j.type === 'disambiguation') return { err: 'disambiguation' }
  return {
    extract: j.extract ?? '',
    title: j.title,
    lat: j.coordinates?.lat ?? null,
    lon: j.coordinates?.lon ?? null,
  }
}

// Retry on 429 with backoff. The first run lost 41 of 98 venues to rate
// limiting at 250ms spacing -- reported as "miss", which reads like a
// coverage failure and is nothing of the sort. Wikipedia's REST API is
// free and unauthenticated; the correct response to 429 is to slow down,
// not to record a false negative.
async function summaryWithRetry(title) {
  for (let attempt = 1; attempt <= 4; attempt++) {
    const r = await summary(title)
    if (!r.rateLimited) return r
    await new Promise(res => setTimeout(res, attempt * 2500))
  }
  return { err: 'HTTP 429 (after 4 retries)' }
}

// On a real 404, try title variants before calling it a miss. Our table's
// venue strings come from the relay, which uses broadcast/display names
// that don't always match Wikipedia's article title. 'Angels Stadium'
// 404s; the article is 'Angel Stadium' (singular). That is a bug in OUR
// table, not Wikipedia's -- and it means the live weather lookup for that
// venue silently finds nothing. Worth surfacing explicitly.
//
// The Stadium<->Field swap below is UNSOUND on its own: Toyota Stadium
// (Frisco, TX) and Toyota Field (San Antonio) are two different real
// venues, as are Riverside Stadium (Middlesbrough) and any "Riverside
// Field". A variant match here can silently resolve a DIFFERENT stadium
// entirely. resolve() below gates every variant match against the
// table's own coordinates before accepting it -- this function still
// generates candidates freely, but generating a candidate is no longer
// the same as trusting it.
function titleVariants(name) {
  const v = [name]
  if (/s\s/.test(name)) v.push(name.replace(/^(\w+)s\s/, '$1 '))   // Angels Stadium -> Angel Stadium
  if (/\bStadium\b/.test(name)) v.push(name.replace(/\bStadium\b/, 'Field'))
  if (/\bField\b/.test(name)) v.push(name.replace(/\bField\b/, 'Stadium'))
  v.push(name.replace(/\./g, ''))                                   // Lower.com Field
  return [...new Set(v)]
}

// TASK 2 fix: a match on the exact original name needs no verification --
// there's no ambiguity to resolve. A match on a VARIANT is only accepted
// if the resolved article's own coordinates agree with the table's truth
// coordinates for this venue (COORD_OK threshold, same as
// probe-poi-geocode.mjs). No coordinates on the article, or coordinates
// that disagree, means the variant is rejected and the next candidate
// (if any) is tried -- never accepted unverified. A rejected variant is
// reported distinctly from a plain miss, since "found an article but
// couldn't confirm it's the right one" is a different, more informative
// outcome than "found nothing at all".
async function resolve(name, truthLat, truthLon) {
  const rejected = []
  for (const t of titleVariants(name)) {
    const r = await summaryWithRetry(t)
    if (r.err === 'disambiguation') return r
    if (r.err) continue

    const isVariant = t !== name
    if (!isVariant) return { ...r, viaVariant: null }

    if (r.lat == null || r.lon == null) {
      rejected.push({ variant: t, reason: 'article has no coordinates to verify against' })
      continue
    }
    const d = dist(r.lat, r.lon, truthLat, truthLon)
    if (d > COORD_OK) {
      rejected.push({ variant: t, reason: `coordinates disagree (delta ${d.toFixed(4)}) -- likely a different venue` })
      continue
    }
    return { ...r, viaVariant: t, coordDelta: d }
  }
  if (rejected.length > 0) return { err: 'no title variant resolved', rejected }
  return { err: 'no title variant resolved' }
}

async function main() {
  const venues = loadVenues()
  log(`probe_at: ${new Date().toISOString()}`)
  log(`venues: ${venues.length}  (source: src/data/weather.js, parsed live)`)
  log(`method: en.wikipedia REST summary -> FIRST SENTENCE ONLY -> classify`)
  log('')

  const score = { correct: 0, wrong: 0, miss: 0 }
  const wrongs = []

  for (const v of venues) {
    let r
    try { r = await resolve(v.name, v.lat, v.lon) } catch (e) { r = { err: String(e).slice(0, 50) } }

    const knownUnfixableNote = KNOWN_UNFIXABLE.get(v.name) ?? null

    if (r.err) {
      score.miss++
      log(`MISS  ${v.name}  (${r.err})  [truth ${v.truth}]`)
      for (const rej of r.rejected ?? []) log(`        rejected variant "${rej.variant}": ${rej.reason}`)
      proposedRows.push({
        name: v.name,
        currentRoofType: v.truth,
        wikipediaRoofType: null,
        leadSentence: null,
        agree: null,
        knownUnfixable: !!knownUnfixableNote,
        note: knownUnfixableNote ?? `no Wikipedia data resolved (${r.err})`,
      })
    } else {
      const sent = firstSentence(r.extract)
      const pred = classify(sent)
      const agree = pred === v.truth
      if (agree) {
        score.correct++
        log(`ok    ${v.name}  -> ${pred}${r.viaVariant ? `   [matched via "${r.viaVariant}" -- OUR TABLE'S NAME IS WRONG -- coords verified, delta ${r.coordDelta.toFixed(4)}]` : ''}`)
      } else {
        score.wrong++
        wrongs.push({ name: v.name, truth: v.truth, pred, sent })
        log(`WRONG ${v.name}  -> predicted ${pred}, truth ${v.truth}`)
        log(`        "${sent.slice(0, 200)}"`)
      }
      proposedRows.push({
        name: v.name,
        currentRoofType: v.truth,
        wikipediaRoofType: pred,
        leadSentence: sent,
        agree,
        knownUnfixable: !!knownUnfixableNote,
        note: knownUnfixableNote,
      })
    }
    flushReview()
    await new Promise(r => setTimeout(r, 1000))
  }

  log('')
  log(`RESULT  correct ${score.correct}/${venues.length}   wrong ${score.wrong}   miss ${score.miss}`)
  log('')
  log('--- every disagreement, in full (this is the useful part) ---')
  for (const w of wrongs) {
    log(`${w.name}: predicted ${w.pred}, table says ${w.truth}`)
    log(`   "${w.sent}"`)
  }

  const disagreeCount = proposedRows.filter(r => r.agree === false).length
  const knownUnfixableCount = proposedRows.filter(r => r.knownUnfixable).length
  log('')
  log(`${REVIEW_PATH}: ${proposedRows.length} rows, ${disagreeCount} disagreements, ${knownUnfixableCount} known-unfixable -- for human review, weather.js NOT modified`)
}

main().catch(e => log('FAILED: ' + String(e)))
