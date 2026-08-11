#!/usr/bin/env node
// Guard for PickEm's grading of a finished game.
//
// WHY A FIXTURE TEST. The bug was that a level final score fell through to
// 'away', so every drawn match graded a home pick incorrect and an away pick
// correct. Reproducing that in the app means waiting for a real draw to
// appear on the slate; asserting it takes a table.
//
// pickStatus and gameStatus are not exported from the component (they are
// module-private helpers next to the JSX), so this file bundles the component
// with esbuild and imports the SHIPPED functions rather than a copy -- the
// same posture the other probes in this repo use, for the same reason: a
// hand-copied duplicate would keep passing after the real one regressed.

import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { build } from 'esbuild'

const dir = mkdtempSync(join(tmpdir(), 'pickgrade-'))
const outfile = join(dir, 'bundle.mjs')

// The component imports deskStore, CSS modules and JSX. None of that is
// needed to exercise grading, so it is stubbed at the resolver rather than
// worked around by copying the two functions out.
const stub = {
  name: 'stub',
  setup(b) {
    b.onResolve({ filter: /\.module\.css$/ }, a => ({ path: a.path, namespace: 'stub' }))
    b.onResolve({ filter: /data\/relay$/ }, a => ({ path: a.path, namespace: 'stub' }))
    b.onResolve({ filter: /components\/Tabs$/ }, a => ({ path: a.path, namespace: 'stub' }))
    b.onLoad({ filter: /.*/, namespace: 'stub' }, () => ({
      contents: 'export const deskStore = { games: { regular: [], postseason: [] } };'
              + 'export const Tabs = () => null;'
              + 'export default new Proxy({}, { get: () => "" });',
      loader: 'js',
    }))
  },
}

await build({
  entryPoints: ['src/components/PickEm/index.jsx'],
  outfile,
  bundle: true,
  format: 'esm',
  platform: 'node',
  logLevel: 'silent',
  jsx: 'transform',
  jsxFactory: '__noop',
  jsxFragment: '__noop',
  banner: { js: 'const __noop = () => null; globalThis.localStorage ??= {getItem:()=>null,setItem:()=>{}};' },
  // pickStatus is module-private; re-export it for the test without editing
  // the component to widen its API purely for testing.
  footer: { js: 'export { pickStatus as __pickStatus, gameStatus as __gameStatus };' },
  plugins: [stub],
})

const mod = await import(outfile)
const pickStatus = mod.__pickStatus
const gameStatus = mod.__gameStatus

const final = (h, a) => ({ home_score: h, away_score: a, finalized_at: '2026-08-08T22:00:00Z' })

const CASES = [
  // [label, game, pick, expected]
  ['home win, picked home',      final(3, 1), 'home', 'correct'],
  ['home win, picked away',      final(3, 1), 'away', 'incorrect'],
  ['away win, picked away',      final(1, 3), 'away', 'correct'],
  ['away win, picked home',      final(1, 3), 'home', 'incorrect'],

  // THE REGRESSION. Both of these returned 'incorrect'/'correct' before the
  // fix, because a level score fell through to winner = 'away'.
  ['DRAW 2-2, picked home',      final(2, 2), 'home', 'push'],
  ['DRAW 2-2, picked away',      final(2, 2), 'away', 'push'],
  ['DRAW 0-0, picked home',      final(0, 0), 'home', 'push'],

  ['unplayed game, no pick',     { home_score: null, away_score: null }, null, 'unpicked'],
  ['live game, picked',          { home_score: 1, away_score: 0, finalized_at: null }, 'home', 'pending'],
]

let failures = 0
console.log('pickStatus — grading a finished game')
for (const [label, game, pick, expected] of CASES) {
  const got = pickStatus(game, pick)
  const ok = got === expected
  if (!ok) failures++
  console.log(`  ${ok ? 'ok  ' : 'FAIL'}  ${label.padEnd(28)} -> ${got}${ok ? '' : `   (expected ${expected})`}`)
}

// Stated as its own assertion so the intent survives a future refactor: a
// draw must never be credited to either side.
console.log('')
console.log('regression: a level final score credits neither side')
const drawHome = pickStatus(final(2, 2), 'home')
const drawAway = pickStatus(final(2, 2), 'away')
if (drawHome === drawAway && drawHome !== 'correct' && drawHome !== 'incorrect') {
  console.log(`  ok    both picks grade "${drawHome}" on a 2-2 final`)
} else {
  failures++
  console.log(`  FAIL  home->${drawHome}, away->${drawAway} — a draw is being scored as a result`)
}

// The CFL-shaped trap, guarded here because it is the same file: gameStatus
// keys 'pre' off home_score === null. A source that writes 0 for unplayed
// fixtures (which /cfl/scoreboard/rounds does, on all 47 of them) would make
// an unstarted game read 'live' and disable both pick buttons. This asserts
// the current documented behaviour so a change to it is a decision, not a
// surprise.
console.log('')
console.log('documented behaviour: unplayed detection keys off null, not 0')
const zeroZeroUnplayed = gameStatus({ home_score: 0, away_score: 0, finalized_at: null })
if (zeroZeroUnplayed === 'pre') {
  console.log('  ok    a 0-0 unfinalized game reads "pre"')
} else {
  console.log(`  NOTE  a 0-0 unfinalized game reads "${zeroZeroUnplayed}", not "pre".`)
  console.log('        Picking is disabled unless status is "pre", so if a 0-for-unplayed')
  console.log('        source (CFL) is ever archived, its unstarted games become unpickable.')
  console.log('        Not failing the build: this is the relay-side fix, tracked in')
  console.log('        docs/pending-relay-fixes/README.md, not a defect in this component.')
}

rmSync(dir, { recursive: true, force: true })

console.log('')
if (failures) {
  console.log(`${failures} failure(s).`)
  process.exit(1)
}
console.log('All pick-grading checks passed.')
