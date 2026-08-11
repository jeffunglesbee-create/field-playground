#!/usr/bin/env node
// Scores confidence gates against what actually happened.
//
// THE POINT. A confidence gate is a forward-stated probability that never gets
// resolved, which makes it unfalsifiable by construction. That is precisely
// the defect fixed in the Calibration component on 2026-08-11 -- forward
// ratings that could never complete because nothing ever settled them. The
// same fix applies here: resolve the claims, then score the forecast.
//
// The metric is the same one, for the same reason: Brier = mean squared error
// between the stated probability and the binary outcome. 0 is perfect, 0.25 is
// "always say 50%", 1 is maximally confident and wrong.
//
// THE BREAKDOWN IS THE WHOLE VALUE. An aggregate Brier over all claims would
// have looked fine on 2026-08-11 -- most claims that day were measured and
// correct. Split by provenance, the two RETRIEVED claims and the one DERIVED
// claim are the entire error, and that pattern is visible immediately rather
// than after someone corrects three things by hand.
//
// Honest-forecast rule, enforced by check-claims.mjs rather than assumed here:
// `resolution` is never written at authoring time.

import { readdirSync, readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'

const DIR = 'docs/outbox/claims'
if (!existsSync(DIR)) { console.log(`No claims directory at ${DIR}.`); process.exit(0) }

const claims = []
for (const f of readdirSync(DIR).filter(f => f.endsWith('.json'))) {
  try {
    for (const c of JSON.parse(readFileSync(join(DIR, f), 'utf8'))) claims.push({ ...c, file: f })
  } catch { /* check-claims.mjs reports malformed files; not this tool's job */ }
}

const resolved = claims.filter(c => c.resolution === 'CONFIRMED' || c.resolution === 'REFUTED')
const open = claims.filter(c => !c.resolution)

console.log(`claims: ${claims.length} total · ${resolved.length} resolved · ${open.length} open`)
console.log('')

if (!resolved.length) {
  console.log('Nothing resolved yet, so no score. That is the honest output, not a zero:')
  console.log('a forecast with no outcome is not a good forecast, it is an unscored one.')
  process.exit(0)
}

const brier = set => set.reduce((s, c) => {
  const outcome = c.resolution === 'CONFIRMED' ? 1 : 0
  return s + (c.confidence - outcome) ** 2
}, 0) / set.length

console.log('=== BRIER BY PROVENANCE (lower is better · 0.25 = coin flip) ===')
const groups = new Map()
for (const c of resolved) {
  if (!groups.has(c.provenance)) groups.set(c.provenance, [])
  groups.get(c.provenance).push(c)
}
const rows = [...groups.entries()]
  .map(([p, set]) => ({
    p, n: set.length, brier: brier(set),
    meanConf: set.reduce((s, c) => s + c.confidence, 0) / set.length,
    hitRate: set.filter(c => c.resolution === 'CONFIRMED').length / set.length,
  }))
  .sort((a, b) => b.brier - a.brier)

console.log('  provenance     n   brier   stated   actual   gap')
for (const r of rows) {
  // The gap is the calibration signal: stated confidence minus how often the
  // claim actually held. Positive means overconfident in that category.
  const gap = r.meanConf - r.hitRate
  const flag = gap > 0.2 ? '  <-- systematically overconfident' : ''
  console.log(`  ${r.p.padEnd(11)} ${String(r.n).padStart(3)}   ${r.brier.toFixed(3)}    ${r.meanConf.toFixed(2)}     ${r.hitRate.toFixed(2)}   ${gap >= 0 ? '+' : ''}${gap.toFixed(2)}${flag}`)
}

console.log('')
console.log(`  OVERALL     ${String(resolved.length).padStart(3)}   ${brier(resolved).toFixed(3)}`)
console.log('')

// Which claims actually cost something, so the reading is concrete.
const refuted = resolved.filter(c => c.resolution === 'REFUTED').sort((a, b) => b.confidence - a.confidence)
if (refuted.length) {
  console.log('=== REFUTED, most confidently stated first ===')
  for (const c of refuted) {
    console.log(`  ${c.confidence.toFixed(2)}  [${c.provenance}]  ${c.text}`)
    if (c.resolutionNote) console.log(`        ${c.resolutionNote}`)
    if (!c.falsifierAttempted) console.log(`        falsifier NOT attempted (${c.falsifierCost ?? 'cost unstated'}): ${c.falsifier}`)
  }
  console.log('')
}

// The actionable pattern: were the failures concentrated in claims whose
// falsifier was cheap and skipped?
const skippedCheap = refuted.filter(c => !c.falsifierAttempted)
if (skippedCheap.length) {
  console.log(`${skippedCheap.length} of ${refuted.length} refuted claim(s) had a falsifier that was never run.`)
  console.log('That is the cheapest available improvement: run them before publishing, not after.')
}

if (open.length) {
  console.log('')
  console.log(`${open.length} claim(s) still open — unresolved, therefore unscored.`)
}
