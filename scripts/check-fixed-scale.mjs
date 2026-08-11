#!/usr/bin/env node
// STANDING RULE: anything user-facing is presented on a 0-100 scale, however
// it is scored internally. Not a preference, and not negotiable per the
// project owner (2026-08-11).
//
// WHAT THIS CATCHES: a visual domain derived from the data being plotted.
// `v / Math.max(...values)` or `[Math.min(...all), Math.max(...all)]` makes
// the tallest thing on screen full-height BY CONSTRUCTION, which
//
//   - destroys comparability between two charts, since both fill their track
//     regardless of magnitude, and
//   - silently rescales on every render, so the same value draws a different
//     height depending on what it happened to be shown beside.
//
// Both defects were real here, measured, not hypothetical:
//   DeskCard drama sparkline -- a real 44..74 arc rendered as 59%..100%.
//   ForkPoint -- a "%"-suffixed axis whose top label was not 100.
//
// DELIBERATELY A TEXT SCAN, and the limits are stated rather than implied.
// It cannot know whether a given Math.max feeds a chart or an analysis, so it
// looks only at files under src/components (view code) and only at the two
// shapes that actually produced defects here. Analysis modules under src/data
// legitimately compute maxima all day and are not scanned.

import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'

const ROOT = 'src/components'

// Shapes that define a visual domain from the data. Kept narrow on purpose:
// a broad "any Math.max" rule would flag every legitimate peak computation in
// a component and get switched off within a week.
const PATTERNS = [
  {
    // [Math.min(...xs), Math.max(...xs)] -- an axis domain from the data
    re: /\[\s*Math\.min\(\s*\.\.\.[^)]*\)\s*,\s*Math\.max\(\s*\.\.\.[^)]*\)\s*\]/g,
    what: 'axis domain derived from the plotted data',
  },
  {
    // v / Math.max(...xs)  -- normalising a value by the series maximum
    re: /\/\s*Math\.max\(\s*\.\.\./g,
    what: 'value normalised by the series maximum',
  },
]

// A file may state, once, that a maximum here is not a visual domain. The
// exemption must name a reason -- an unexplained opt-out is how a rule dies.
const EXEMPT = /fixed-scale-exempt:\s*\S+/

function walk(dir, acc = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) walk(p, acc)
    else if (/\.(jsx|js)$/.test(name)) acc.push(p)
  }
  return acc
}

let findings = 0
let exempted = 0
const files = walk(ROOT)

for (const f of files) {
  const text = readFileSync(f, 'utf8')
  const rel = relative(process.cwd(), f)
  const lines = text.split('\n')
  for (const { re, what } of PATTERNS) {
    re.lastIndex = 0
    let m
    while ((m = re.exec(text)) !== null) {
      const line = text.slice(0, m.index).split('\n').length
      // Look for an exemption on the flagged line or the five above it.
      const window = lines.slice(Math.max(0, line - 6), line).join('\n')
      if (EXEMPT.test(window)) { exempted++; continue }
      findings++
      console.log(`  FAIL  ${rel}:${line}`)
      console.log(`        ${what}`)
      console.log(`        ${lines[line - 1].trim().slice(0, 96)}`)
      console.log('        User-facing scales are fixed 0-100. If this maximum is not a')
      console.log('        visual domain, add a comment "fixed-scale-exempt: <reason>" above it.')
    }
  }
}

console.log('')
console.log(`scanned ${files.length} component file(s) under ${ROOT}`)
if (exempted) console.log(`${exempted} site(s) carry a stated exemption`)

if (findings) {
  console.log(`${findings} self-normalising visual scale(s).`)
  process.exit(1)
}
console.log('No self-normalising visual scales. All user-facing scales are fixed.')
