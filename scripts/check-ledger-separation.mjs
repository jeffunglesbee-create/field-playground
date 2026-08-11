#!/usr/bin/env node
// Guard for the two pick ledgers staying two ledgers.
//
// WHY THIS EXISTS. outcomes() holds EDITORIAL verdicts -- FIELD's ambient
// picks, carrying a tier, marked by hand in AmbientPanel. myResults() holds
// the verdict on the USER'S OWN picks, derived by PickEm from final scores.
//
// Agreement and CrossCheck read outcomes() as the editorial side and compare
// it against PickEm's `picks` store. If a derived result ever lands in
// outcomes(), those components compare a pick against its own result: a
// tautology that reports perfect agreement, with no error raised anywhere.
// That is a silent, plausible-looking wrong answer -- the exact failure class
// this repo keeps finding -- so the separation gets an assertion rather than
// a comment.
//
// Two halves: a behavioural test of the shipped module, and a static check
// that no component writes the wrong ledger.

import { mkdtempSync, rmSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { build } from 'esbuild'

const dir = mkdtempSync(join(process.cwd(), '.probe-tmp-'))
const outfile = join(dir, 'bundle.mjs')
await build({
  entryPoints: ['src/data/outcomes.js'],
  outfile, bundle: true, format: 'esm', platform: 'node',
  logLevel: 'silent', external: ['solid-js'],
  banner: {
    js: `const __m = new Map();
globalThis.localStorage = {
  getItem: k => (__m.has(k) ? __m.get(k) : null),
  setItem: (k, v) => { __m.set(k, String(v)) },
  removeItem: k => { __m.delete(k) }, clear: () => __m.clear(),
};`,
  },
})
const { setOutcome, setMyResult, outcomes, myResults } = await import(outfile)

let failures = 0
const check = (label, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want)
  if (!ok) failures++
  console.log(`  ${ok ? 'ok  ' : 'FAIL'}  ${label.padEnd(56)} ${JSON.stringify(got)}${ok ? '' : `  (expected ${JSON.stringify(want)})`}`)
}

console.log('ledger separation — a write to one must not appear in the other')
setMyResult('game-mine', 'W')
check('setMyResult lands in myResults', myResults()['game-mine'], 'W')
check('setMyResult does NOT touch outcomes', outcomes()['game-mine'], undefined)

setOutcome('game-editorial', 'L', 'A')
check('setOutcome lands in outcomes', outcomes()['game-editorial'], 'L')
check('setOutcome does NOT touch myResults', myResults()['game-editorial'], undefined)

// The same game can legitimately appear in both: FIELD picked it, and so did
// the user. They must not overwrite each other, and they may disagree -- that
// disagreement is precisely what Agreement exists to show.
console.log('')
console.log('a game in BOTH ledgers keeps two independent verdicts')
setOutcome('game-both', 'W', 'B')
setMyResult('game-both', 'L')
check('editorial verdict preserved', outcomes()['game-both'], 'W')
check('own-pick verdict preserved', myResults()['game-both'], 'L')

// Idempotency is what makes it safe to call from a reactive effect that also
// observes the signal. Without it the effect re-triggers itself forever.
console.log('')
console.log('setMyResult is idempotent and rejects junk')
const before = JSON.stringify(myResults())
setMyResult('game-mine', 'W')
check('re-writing the same value is a no-op', JSON.stringify(myResults()), before)
setMyResult('game-junk', 'pending')
check('non-W/L/P value rejected', myResults()['game-junk'], undefined)

// ---- static half: nobody writes the wrong ledger ----
console.log('')
console.log('static: only AmbientPanel writes outcomes, only PickEm writes myResults')
function walk(d, acc = []) {
  for (const name of readdirSync(d)) {
    const p = join(d, name)
    if (statSync(p).isDirectory()) walk(p, acc)
    else if (/\.(jsx|js)$/.test(name)) acc.push(p)
  }
  return acc
}
const ALLOWED_OUTCOME_WRITERS = ['src/components/AmbientPanel/index.jsx']
const ALLOWED_MYRESULT_WRITERS = ['src/components/PickEm/index.jsx']

for (const f of walk('src')) {
  const rel = f.replace(process.cwd() + '/', '')
  if (rel === 'src/data/outcomes.js') continue // the module defining both
  const text = readFileSync(f, 'utf8')
  if (/\bsetOutcome\s*\(/.test(text) && !ALLOWED_OUTCOME_WRITERS.includes(rel)) {
    failures++
    console.log(`  FAIL  ${rel} writes the EDITORIAL ledger (setOutcome).`)
    console.log('        If this is a derived, self-pick verdict it belongs in myResults --')
    console.log('        putting it in outcomes() makes Agreement compare a pick to itself.')
  }
  if (/\bsetMyResult\s*\(/.test(text) && !ALLOWED_MYRESULT_WRITERS.includes(rel)) {
    failures++
    console.log(`  FAIL  ${rel} writes the OWN-PICK ledger (setMyResult) unexpectedly.`)
  }
}
if (!failures) console.log('  ok    no unexpected writer of either ledger')

rmSync(dir, { recursive: true, force: true })

console.log('')
if (failures) {
  console.log(`${failures} failure(s).`)
  process.exit(1)
}
console.log('All ledger-separation checks passed.')
