#!/usr/bin/env node
// Turn the claims ledger's warnings into a follow-up list that something
// other than my memory is responsible for chasing.
//
// WHY THIS EXISTS. check-claims.mjs already prints "CHEAP falsifier was NOT
// attempted" on every run, and has done since the ledger was created. Six of
// those warnings have been printing for days. A warning that nothing acts on
// is the same failure the ledger was built to fix, one level up: the gate
// scored itself 88 and nobody resolved it either.
//
// So this emits a ranked, actionable list and exits non-zero when something
// is genuinely overdue. The scheduled workflow that runs it syncs the output
// into a GitHub issue, which means the follow-up outlives the session that
// created it -- that is the entire point. A session ends; an issue does not.
//
// RANKING, and the order is an argument rather than a preference:
//   1. Cheap falsifier, never attempted, high confidence. The single
//      highest-risk shape in any document. Every correction this repo has
//      taken so far has been one of these.
//   2. Stale RETRIEVED. Quoting a status line ages badly; RETRIEVED is also
//      the worst-calibrated provenance in the ledger by a wide margin.
//   3. Open claims with a resolvable falsifier. Forecasts that could
//      complete and have not.
//   4. Everything else open, listed but not chased.
//
// Reads only. Writes nothing. Prints markdown on stdout so the workflow can
// pipe it straight into an issue body.

import { readFileSync, readdirSync, existsSync } from 'node:fs'
import { join } from 'node:path'

const DIR = 'docs/outbox/claims'
const STALE_DAYS = 30
const NOW = Date.now()

// The confidence above which an unattempted cheap falsifier stops being a
// loose end and becomes a liability. Below it the claim is already hedged.
const RISKY_CONFIDENCE = 0.7

const args = new Set(process.argv.slice(2))
const strict = args.has('--strict')

const ageDays = c => {
  const t = Date.parse(c.asOf ?? '')
  return Number.isFinite(t) ? (NOW - t) / 86400000 : null
}
const isCheap = c => /one (tool call|search|query|command|read_file call|CI dispatch|grep|read)/i.test(c.falsifierCost ?? '')
const open = c => !c.resolution

// THE TWO DEBT PREDICATES, NAMED ONCE.
//
// They were inline in the `claims.filter(...)` calls below, and the first
// version of the self-test re-declared them beside its fixtures. That test
// would have passed while the real filters stayed broken -- it computed its
// expectation from a copy of its subject. Both the buckets and the fixtures
// now call these.
const isRiskyDebt = c =>
  open(c) && c.falsifierAttempted === false && isCheap(c) && (c.confidence ?? 0) >= RISKY_CONFIDENCE

const isStaleRetrieved = c =>
  open(c) && c.provenance === 'RETRIEVED' && c.reverified !== true && (ageDays(c) ?? -1) > STALE_DAYS

// --self-test: the bucket predicates against fixtures, touching no ledger.
//
// Added with the resolved-claim filter. This file had no test at all, which is
// why a bucket could list three already-refuted claims for two weeks without
// anything noticing -- the only reader was a human skimming an issue.
if (args.has('--self-test')) {
  let pass = 0, fail = 0
  const t = (name, got, want, note = '') => {
    const ok = got === want
    ok ? pass++ : fail++
    console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok || !note ? '' : `\n      → ${note}`}`)
  }
  const risky = isRiskyDebt
  const debt = { falsifierAttempted: false, falsifierCost: 'one search', confidence: 0.9 }

  t('an open, confident, unattempted cheap falsifier is debt', risky(debt), true)
  // THE BUG, as a fixture. Three claims in this exact state sat in the issue's
  // "Run these first" section for two weeks.
  t('A RESOLVED CLAIM IS NOT DEBT, even with falsifierAttempted: false',
    risky({ ...debt, resolution: 'REFUTED' }), false,
    'relay-ccmds-none-picked-up was REFUTED on 2026-08-11 and still listed on 2026-08-24')
  t('...and CONFIRMED resolves it too', risky({ ...debt, resolution: 'CONFIRMED' }), false)
  t('an attempted falsifier is not debt', risky({ ...debt, falsifierAttempted: true }), false)
  t('a hedged claim below the threshold is not debt', risky({ ...debt, confidence: 0.6 }), false)
  t('an EXPENSIVE falsifier is not cheap debt',
    risky({ ...debt, falsifierCost: 'a week of instrumentation' }), false)
  t('`one CI dispatch` counts as cheap',
    isCheap({ falsifierCost: 'one CI dispatch with a longer timeout' }), true)

  const stale = { provenance: 'RETRIEVED', asOf: new Date(NOW - 60 * 86400000).toISOString() }
  const isStale = isStaleRetrieved
  t('an old, unreverified RETRIEVED claim is stale', isStale(stale), true)
  t('a RESOLVED stale claim is not chased either',
    isStale({ ...stale, resolution: 'REFUTED' }), false)
  t('a re-verified one is not stale', isStale({ ...stale, reverified: true }), false)
  t('a claim with no asOf is not stale by default', isStale({ ...stale, asOf: undefined }), false)

  console.log(`\n${pass}/${pass + fail} checks passed`)
  process.exit(fail ? 1 : 0)
}

if (!existsSync(DIR)) {
  console.log('No claims directory; nothing to chase.')
  process.exit(0)
}

const claims = []
for (const f of readdirSync(DIR).filter(f => f.endsWith('.json'))) {
  let parsed
  try {
    parsed = JSON.parse(readFileSync(join(DIR, f), 'utf8'))
  } catch (e) {
    console.log(`**Unreadable ledger** \`${f}\`: ${e.message}`)
    process.exit(1)
  }
  for (const c of parsed) claims.push({ ...c, file: f })
}


// ---- the four buckets ----
// A RESOLVED CLAIM OWES NOTHING, whatever its flags say.
//
// Both debt buckets used to skip this filter, and it showed. On 2026-08-24 the
// tracking issue's "Run these first" section listed five claims and THREE of
// them were already REFUTED -- `relay-ccmds-none-picked-up`,
// `duplicate-fixture-mechanism-open` and `mlb-cron-was-running`, each carrying
// a resolutionNote that describes exactly what its stated falsifier prescribed.
// The falsifier had been run. Only `falsifierAttempted` was never flipped.
//
// So the list that exists to be acted on was 60% work already done, and the
// header of this very file names what that costs:
//
//   "A warning that nothing acts on is the same failure the ledger was built
//    to fix, one level up."
//
// A follow-up list you have to audit before trusting is one you stop reading.
//
// This is the durable half of the fix and it is deliberately not the flag
// update. A claim CAN legitimately be resolved without its stated falsifier
// ever being run -- other evidence settled it -- and in that case
// `falsifierAttempted: false` is accurate and must stay. What ends the debt is
// the resolution, not the flag.
const unattemptedRisky = claims.filter(isRiskyDebt)
const staleRetrieved = claims.filter(isStaleRetrieved)

const seen = new Set([...unattemptedRisky, ...staleRetrieved].map(c => c.id))
const openResolvable = claims.filter(c =>
  open(c) && !seen.has(c.id) && c.verifiableHere === true && c.falsifier)
openResolvable.forEach(c => seen.add(c.id))
const otherOpen = claims.filter(c => open(c) && !seen.has(c.id))

const line = c => {
  const d = ageDays(c)
  const age = d === null ? '' : ` · ${Math.round(d)}d old`
  return `- **\`${c.id}\`** (${c.provenance}, ${((c.confidence ?? 0) * 100).toFixed(0)}%${age})\n` +
         `  ${c.text}\n` +
         `  *Falsifier:* ${c.falsifier ?? '(none stated)'}${c.falsifierCost ? ` — ${c.falsifierCost}` : ''}`
}

const section = (title, why, list) => {
  if (!list.length) return ''
  return `\n### ${title} (${list.length})\n\n${why}\n\n${list.map(line).join('\n\n')}\n`
}

let out = `# Claims follow-ups\n\n`
out += `${claims.length} claim(s) · ${claims.filter(open).length} open · `
out += `${unattemptedRisky.length} unattempted cheap falsifier(s) at ${RISKY_CONFIDENCE * 100}%+\n`

out += section(
  'Run these first',
  'A cheap falsifier that was never run, behind a confident claim. Every correction this repo has taken so far had exactly this shape. Run it or lower the confidence — those are the only two honest moves.',
  unattemptedRisky)

out += section(
  `Stale retrieved (over ${STALE_DAYS}d, not re-verified)`,
  'A quoted status line is a statement about the moment it was written. RETRIEVED is also the worst-calibrated provenance in this ledger, so age and provenance compound here rather than adding.',
  staleRetrieved)

out += section(
  'Open, and resolvable from a session like this one',
  'Forecasts that could be settled and have not been. An unresolved gate is an unscored one.',
  openResolvable)

out += section(
  'Open, needing access this session does not have',
  'Listed so they are not silently lost. Not actionable without a credential or a repo this session cannot reach.',
  otherOpen)

if (!unattemptedRisky.length && !staleRetrieved.length) {
  out += `\nNothing overdue. Every confident claim has had its cheap falsifier run, and no retrieved claim has gone stale.\n`
}

console.log(out)

// --strict is what the scheduled job uses: the two buckets that represent a
// real, cheap, unpaid debt fail the run. The other two are informational --
// an open claim that needs a credential this session lacks is not a defect.
if (strict && (unattemptedRisky.length || staleRetrieved.length)) {
  console.error(`\n${unattemptedRisky.length + staleRetrieved.length} overdue follow-up(s).`)
  process.exit(1)
}
