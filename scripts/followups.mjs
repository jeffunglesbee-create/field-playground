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

const ageDays = c => {
  const t = Date.parse(c.asOf ?? '')
  return Number.isFinite(t) ? (NOW - t) / 86400000 : null
}
const isCheap = c => /one (tool call|search|query|command|read_file call|CI dispatch|grep|read)/i.test(c.falsifierCost ?? '')
const open = c => !c.resolution

// ---- the four buckets ----
const unattemptedRisky = claims.filter(c =>
  c.falsifierAttempted === false && isCheap(c) && (c.confidence ?? 0) >= RISKY_CONFIDENCE)

const staleRetrieved = claims.filter(c => {
  if (c.provenance !== 'RETRIEVED' || c.reverified === true) return false
  const d = ageDays(c)
  return d !== null && d > STALE_DAYS
})

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
