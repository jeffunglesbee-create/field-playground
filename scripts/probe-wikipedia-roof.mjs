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

const UA = 'field-playground-probe/1.0 (github.com/jeffunglesbee-create/field-playground; research)'

// Ground truth parsed from the live table, so this can't drift from it.
function loadVenues() {
  const s = readFileSync('src/data/weather.js', 'utf-8')
  const re = /'([^']+)':\s*\[\s*(-?[\d.]+),\s*(-?[\d.]+),\s*'(open|retractable|dome)'/g
  const rows = []
  let m
  while ((m = re.exec(s)) !== null) rows.push({ name: m[1], truth: m[4] })
  return rows
}

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
  if (!res.ok) return { err: `HTTP ${res.status}` }
  const j = await res.json()
  if (j.type === 'disambiguation') return { err: 'disambiguation' }
  return { extract: j.extract ?? '', title: j.title }
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
    try { r = await summary(v.name) } catch (e) { r = { err: String(e).slice(0, 50) } }

    if (r.err) {
      score.miss++
      log(`MISS  ${v.name}  (${r.err})  [truth ${v.truth}]`)
    } else {
      const sent = firstSentence(r.extract)
      const pred = classify(sent)
      if (pred === v.truth) {
        score.correct++
        log(`ok    ${v.name}  -> ${pred}`)
      } else {
        score.wrong++
        wrongs.push({ name: v.name, truth: v.truth, pred, sent })
        log(`WRONG ${v.name}  -> predicted ${pred}, truth ${v.truth}`)
        log(`        "${sent.slice(0, 200)}"`)
      }
    }
    await new Promise(r => setTimeout(r, 250))
  }

  log('')
  log(`RESULT  correct ${score.correct}/${venues.length}   wrong ${score.wrong}   miss ${score.miss}`)
  log('')
  log('--- every disagreement, in full (this is the useful part) ---')
  for (const w of wrongs) {
    log(`${w.name}: predicted ${w.pred}, table says ${w.truth}`)
    log(`   "${w.sent}"`)
  }
}

main().catch(e => log('FAILED: ' + String(e)))
