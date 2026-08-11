#!/usr/bin/env node
// Guard for the forward/retrospective split in outcomes.js.
//
// THE INVARIANT THAT MATTERS. A confidence rating counts as a forecast only
// if no outcome existed for that game when it was written. If a rating can be
// promoted to "forward" later -- by re-rating, by a re-render, by any path --
// then hindsight leaks back into the Brier score and the metric silently
// becomes the thing it was just fixed for.
//
// Exercises the SHIPPED module. localStorage is stubbed in memory because the
// module reads it at import time; everything else is the real code.

// Bundled rather than imported directly: outcomes.js uses Vite-style
// extensionless imports ('./gameId'), which node will not resolve. esbuild
// resolves them the same way the app does, so this still exercises the
// shipped module rather than a copy -- same approach as check-pick-grading.
import { mkdtempSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { build } from 'esbuild'

// Bundle lands INSIDE the repo, not /tmp: solid-js stays external so the real
// package is used, and node only resolves it from a path under node_modules'
// project root.
const dir = mkdtempSync(join(process.cwd(), '.probe-tmp-'))
const outfile = join(dir, 'bundle.mjs')
await build({
  entryPoints: ['src/data/outcomes.js'],
  outfile,
  bundle: true,
  format: 'esm',
  platform: 'node',
  logLevel: 'silent',
  external: ['solid-js'],
  banner: {
    js: `const __m = new Map();
globalThis.localStorage = {
  getItem: k => (__m.has(k) ? __m.get(k) : null),
  setItem: (k, v) => { __m.set(k, String(v)) },
  removeItem: k => { __m.delete(k) },
  clear: () => __m.clear(),
};`,
  },
})

const { setOutcome, setConfidence, confidenceModeFor, confidence, FORWARD, RETRO } =
  await import(outfile)

let failures = 0
const check = (label, got, want) => {
  const ok = got === want
  if (!ok) failures++
  console.log(`  ${ok ? 'ok  ' : 'FAIL'}  ${label.padEnd(52)} ${got}${ok ? '' : `  (expected ${want})`}`)
}

console.log('confidence mode — classified by what was known at write time')

// A rating made while the game is unresolved is a real forecast.
setConfidence('game-forecast', 70)
check('rated with no outcome -> forward', confidenceModeFor('game-forecast'), FORWARD)

// A rating made after the outcome is hindsight.
setOutcome('game-hindsight', 'W')
setConfidence('game-hindsight', 90)
check('rated after outcome -> retro', confidenceModeFor('game-hindsight'), RETRO)

// THE REGRESSION THAT MATTERS MOST. The forecast above resolves, and the user
// re-rates it. It must stay forward on its ORIGINAL rating, and re-rating must
// never turn a hindsight entry into a forecast.
console.log('')
console.log('regression: a mode is fixed at first write and never promoted')
setOutcome('game-forecast', 'W')
setConfidence('game-forecast', 95)
check('forecast stays forward after resolving', confidenceModeFor('game-forecast'), FORWARD)
setConfidence('game-hindsight', 55)
check('hindsight never promotes to forward', confidenceModeFor('game-hindsight'), RETRO)

// Legacy data carries no mode. Every such rating was captured through a UI
// that displayed the result beside the slider, so unknown must read as
// hindsight -- absence of evidence is not evidence of a forecast here.
console.log('')
console.log('legacy entries with no recorded mode read as hindsight')
check('never-rated id -> retro', confidenceModeFor('game-never-seen'), RETRO)

// Clamping still holds across the change.
console.log('')
console.log('clamping')
setConfidence('game-clamp-hi', 150)
setConfidence('game-clamp-lo', -20)
check('over 100 clamps to 100', confidence()['game-clamp-hi'], 100)
check('under 0 clamps to 0', confidence()['game-clamp-lo'], 0)

rmSync(dir, { recursive: true, force: true })

console.log('')
if (failures) {
  console.log(`${failures} failure(s).`)
  process.exit(1)
}
console.log('All confidence-mode checks passed.')
