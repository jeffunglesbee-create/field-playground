#!/usr/bin/env node
// scripts/check-chart-invariants.mjs — the two chart renderers keep the same
// three promises.
//
// src/data/chart.js here and src/utils/chart.js in jubilant-bassoon are
// deliberate ports, not copies: this one is Solid-lifecycle (onMount /
// onCleanup, so destroyChart is the normal path), that one carries a sweep for
// a codebase that rebuilds cards with innerHTML. A byte-identity check would be
// wrong and would be deleted the first time either legitimately diverges.
//
// What must NOT diverge is the behaviour both repos depend on. The umpire table
// is the case study: a copy that was locally true and silently reverted for
// eight weeks, because nothing asserted the property that mattered.
//
// Three invariants, each with a reason it is here:
//
//   FIXED DOMAIN SUPPORT. An opts.range must reach the y scale. Without it
//   every chart auto-scales to its own maximum and a calm minute draws like a
//   crisis — the failure field-laboratory's spark-check.mjs was written for.
//   check-fixed-scale.mjs enforces the CALL SITES; this enforces the renderer
//   that has to honour them.
//
//   SETDATA, NOT REMOUNT. A second call on the same element must update in
//   place. Solid re-runs effects far more often than a poll does; rebuilding
//   the canvas each time is the ambient-panel scroll-reset shape (Rule 89).
//
//   AN ARIA SUMMARY. A canvas is unreadable to assistive tech. The mount
//   carries the numbers in text or the chart is silent.
//
// --self-test proves the check can fail before it is trusted.

import { readFileSync } from 'fs'

const LOCAL = 'src/data/chart.js'

const INVARIANTS = [
  { name: 'fixed domain reaches the y scale',
    test: s => /opts\.range/.test(s) && /scales\.y\s*=\s*\{\s*range:/.test(s) },
  { name: 'a second call updates via setData',
    test: s => /_uplot\.setData\(data\)/.test(s) && /_uplotSeriesCount === data\.length/.test(s) },
  { name: 'the mount carries an aria summary',
    test: s => /setAttribute\('aria-label'/.test(s) && /setAttribute\('role', 'img'\)/.test(s) },
]

let failed = 0
const check = (name, ok, detail = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok || !detail ? '' : `\n      → ${detail}`}`)
  if (!ok) failed++
}

if (process.argv.includes('--self-test')) {
  const good = `opts.range scales.y = { range: () => x }
    el._uplot.setData(data) el._uplotSeriesCount === data.length
    el.setAttribute('role', 'img'); el.setAttribute('aria-label', 'x')`
  for (const inv of INVARIANTS) check(`self-test: "${inv.name}" passes a compliant source`, inv.test(good))
  for (const inv of INVARIANTS) check(`self-test: "${inv.name}" FAILS an empty source`, !inv.test(''))
  // The one that matters: a renderer that remounts instead of updating must be
  // caught, not merely a renderer that is missing entirely.
  const remounts = good.replace('el._uplot.setData(data)', 'el._uplot.redraw()')
  check('self-test: a renderer that redraws instead of setData is caught',
    !INVARIANTS[1].test(remounts))
  console.log('')
}

let src
try {
  src = readFileSync(LOCAL, 'utf8')
} catch (e) {
  check(`${LOCAL} is readable`, false, e.message)
  process.exit(1)
}

check(`${LOCAL} was actually read`, src.length > 500,
  `${src.length} chars — every invariant below would pass or fail vacuously`)
for (const inv of INVARIANTS) check(`${LOCAL}: ${inv.name}`, inv.test(src))

console.log(`\n${failed === 0 ? 'PASS' : 'FAIL'}  ${failed} failing`)
process.exit(failed === 0 ? 0 : 1)
