#!/usr/bin/env node
// Guard for parseGameId, run against REAL ids measured from the relay.
//
// WHY A FIXTURE TEST AND NOT A BROWSER CHECK. The bug this guards was that
// three of the four id schemes in circulation were silently dropped from
// PickStreak. It cannot be reproduced by driving the app, because nobody has
// an archive-keyed outcome in localStorage -- the failure only appears once
// an outcome is marked on a game whose id came from the archive writer. So
// the ids below are the evidence, copied from measured probe output, and this
// script is the only place the fix is observable.
//
// OFFLINE AND DETERMINISTIC, same posture as check-anomaly-invariants.mjs:
// no network, no browser, no clock. Fails loudly with a nonzero exit.

import { parseGameId } from '../src/data/gameId.js'

// Every id here is real, with its provenance. A fabricated fixture would only
// prove the parser matches my expectations, which is the failure mode that
// produced the original regex.
const CASES = [
  {
    id: '2026-05-25-mlb-baltim-tampa',
    from: 'outbox/drama-leaderboard-wp-movement-probe-2026-08-01T01-46-34-126Z.txt',
    date: '2026-05-25',
    sport: 'MLB',
  },
  {
    id: 'MLS_2026-08-06_newyorkcityfootballclub_clubsantoslaguna',
    from: 'docs/pending-relay-fixes/README.md (duplicate-fixtures entry, measured 2026-08-08)',
    date: '2026-08-06',
    sport: 'MLS',
  },
  {
    id: 'MLS_MLS-COM-000006_MLS-MAT-000A3C_phaseone_2026-08-06',
    from: 'docs/pending-relay-fixes/README.md (duplicate-fixtures entry, measured 2026-08-08)',
    date: '2026-08-06',
    sport: 'MLS',
  },
  {
    // The mislabel the soccer-league patch fixes. Parsing it correctly matters
    // precisely BECAUSE it is wrong: these rows exist today, and dropping them
    // would hide the very games the label fix is about.
    id: 'FIFA World Cup 2026_2026-08-06_teamone_teamtwo',
    from: 'src/index.js archive write sites (label bug, measured 52/60 rows)',
    date: '2026-08-06',
    sport: 'FIFA World Cup 2026',
  },
]

// Inputs that must NOT produce a confident answer. A parser that invents a
// date for junk is worse than one that returns null, because the caller
// cannot tell the difference.
const MUST_BE_NULL = [
  ['', 'empty string'],
  ['not-an-id', 'no date anywhere'],
  ['MLS_no-date-here_teams', 'underscore scheme with no date'],
  [null, 'null input'],
  [undefined, 'undefined input'],
  [12345, 'non-string input'],
]

let failures = 0
const fail = msg => { failures++; console.log('  FAIL  ' + msg) }

console.log('parseGameId — real measured ids')
for (const c of CASES) {
  const got = parseGameId(c.id)
  const ok = got.date === c.date && got.sport === c.sport
  console.log(`  ${ok ? 'ok  ' : 'FAIL'}  ${c.id}`)
  if (!ok) {
    failures++
    console.log(`          expected date=${c.date} sport=${c.sport}`)
    console.log(`          got      date=${got.date} sport=${got.sport}`)
    console.log(`          source:  ${c.from}`)
  }
}

console.log('')
console.log('parseGameId — inputs that must stay null rather than guess')
for (const [input, label] of MUST_BE_NULL) {
  const got = parseGameId(input)
  if (got.date !== null) fail(`${label}: invented a date (${got.date})`)
  else console.log(`  ok    ${label}`)
}

// The regression itself, stated as an assertion rather than a comment: the
// old inline regex required the id to START with a date. If someone
// reintroduces that anchoring, this is the line that catches it.
console.log('')
console.log('regression: underscore schemes must not require a leading date')
const underscoreOnly = CASES.filter(c => !/^\d{4}-\d{2}-\d{2}/.test(c.id))
if (underscoreOnly.length < 3) {
  fail('fixture set no longer covers the three non-leading-date schemes')
} else if (underscoreOnly.every(c => parseGameId(c.id).date !== null)) {
  console.log(`  ok    all ${underscoreOnly.length} non-leading-date schemes parsed`)
} else {
  fail('a non-leading-date scheme parsed to null — the original bug is back')
}

console.log('')
if (failures) {
  console.log(`${failures} failure(s).`)
  process.exit(1)
}
console.log('All parseGameId checks passed.')
