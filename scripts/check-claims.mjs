#!/usr/bin/env node
// Validates the claims ledger. See docs/outbox/claims/README.md for why it
// exists: a confidence gate that enumerates only acknowledged unknowns cannot
// catch the claims stated flatly, and on 2026-08-11 all three real errors were
// in exactly those.
//
// Enforces four things a prose gate cannot:
//   1. provenance typed, and MEASURED actually backed by a file on disk
//   2. RETRIEVED claims carry the age of their source, and go stale
//   3. every claim names a falsifier and whether it was run
//   4. claims about things this session cannot reach are marked as such
//
// Offline and deterministic. Exits nonzero on any violation.

import { readdirSync, readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'

const DIR = 'docs/outbox/claims'
const PROVENANCE = ['MEASURED', 'DERIVED', 'RETRIEVED', 'ASSUMED']
const RESOLUTIONS = ['CONFIRMED', 'REFUTED', 'PARTIAL']

// A retrieved status line older than this, never re-verified, is treated as
// unknown rather than true. Two days is deliberately short: the failure it
// models took three days to bite, and a threshold set at the observed failure
// length catches nothing.
const STALE_DAYS = 2

// An ASSUMED claim is a guess. It may be a good guess, but stating it at 0.9
// is how a guess becomes a fact three documents later.
const ASSUMED_MAX_CONFIDENCE = 0.6

// Cheap falsifiers left unrun are the single highest-risk shape in a document.
const CHEAP = /^(one|two|a few) (tool call|command|grep|search|query)/i

const now = Date.now()
let errors = 0
let warnings = 0
const err = m => { errors++; console.log('  FAIL  ' + m) }
const warn = m => { warnings++; console.log('  WARN  ' + m) }

if (!existsSync(DIR)) {
  console.log(`No claims directory at ${DIR} — nothing to check.`)
  process.exit(0)
}

const files = readdirSync(DIR).filter(f => f.endsWith('.json'))
if (!files.length) {
  console.log('No claim files yet.')
  process.exit(0)
}

let total = 0
const byProvenance = new Map()

for (const f of files) {
  const path = join(DIR, f)
  let claims
  try {
    claims = JSON.parse(readFileSync(path, 'utf8'))
  } catch (e) {
    err(`${f}: not valid JSON — ${String(e.message).slice(0, 80)}`)
    continue
  }
  if (!Array.isArray(claims)) { err(`${f}: expected an array of claims`); continue }

  console.log(`${f} — ${claims.length} claim(s)`)
  const seen = new Set()

  for (const c of claims) {
    total++
    const at = `${f}#${c.id ?? '(no id)'}`

    if (!c.id) err(`${at}: missing id`)
    else if (seen.has(c.id)) err(`${at}: duplicate id`)
    else seen.add(c.id)

    if (!c.text) err(`${at}: missing text`)

    // ---- 1. provenance, and MEASURED must be backed by something real ----
    if (!PROVENANCE.includes(c.provenance)) {
      err(`${at}: provenance must be one of ${PROVENANCE.join('|')}, got ${JSON.stringify(c.provenance)}`)
    }
    if (c.provenance === 'MEASURED') {
      if (!c.source) err(`${at}: MEASURED requires a source`)
      else if (!c.source.startsWith('codex:') && !existsSync(c.source)) {
        err(`${at}: MEASURED source does not exist on disk: ${c.source}`)
        console.log('        A measurement whose artifact cannot be opened is an assumption.')
      }
    }
    if (c.provenance === 'DERIVED' && !c.derivedFrom) {
      err(`${at}: DERIVED requires derivedFrom — state the inference in one line`)
      console.log('        The 2026-08-11 MLB error was a DERIVED claim written as an observation.')
    }

    // ---- 2. retrieval freshness ----
    if (c.provenance === 'RETRIEVED') {
      if (!c.source) err(`${at}: RETRIEVED requires a source`)
      if (!c.asOf) {
        err(`${at}: RETRIEVED requires asOf — when the SOURCE was written`)
      } else {
        const age = (now - Date.parse(c.asOf)) / 86400000
        if (!Number.isFinite(age)) err(`${at}: asOf is not a parseable timestamp`)
        else if (age > STALE_DAYS && !c.reverified) {
          err(`${at}: source is ${age.toFixed(1)}d old and not re-verified (limit ${STALE_DAYS}d)`)
          console.log('        A status field is a statement about the moment it was written.')
        }
      }
    }

    // ---- 3. falsifier, and whether it was actually run ----
    if (!c.falsifier) err(`${at}: every claim needs a falsifier`)
    if (typeof c.falsifierAttempted !== 'boolean') {
      err(`${at}: falsifierAttempted must be true or false`)
    } else if (!c.falsifierAttempted && CHEAP.test(c.falsifierCost ?? '')) {
      warn(`${at}: CHEAP falsifier ("${c.falsifierCost}") was NOT attempted`)
      console.log('        Highest-risk shape in the document. Run it or lower the confidence.')
    }

    // ---- 4. access boundary ----
    if (typeof c.verifiableHere !== 'boolean') {
      err(`${at}: verifiableHere must be true or false`)
    } else if (!c.verifiableHere && (c.confidence ?? 0) > 0.7) {
      err(`${at}: not verifiable in this session but stated at ${c.confidence}`)
      console.log('        The access boundary is knowable in advance; cap confidence accordingly.')
    }

    // ---- confidence hygiene ----
    if (typeof c.confidence !== 'number' || c.confidence < 0 || c.confidence > 1) {
      err(`${at}: confidence must be a number in 0..1`)
    } else if (c.provenance === 'ASSUMED' && c.confidence > ASSUMED_MAX_CONFIDENCE) {
      err(`${at}: ASSUMED capped at ${ASSUMED_MAX_CONFIDENCE}, got ${c.confidence}`)
    }

    // ---- resolutions are added later, never at authoring time ----
    if (c.resolution !== undefined) {
      if (!RESOLUTIONS.includes(c.resolution)) {
        err(`${at}: resolution must be one of ${RESOLUTIONS.join('|')}`)
      }
      if (!c.resolvedAt) err(`${at}: a resolution requires resolvedAt`)
      else if (c.asOf && Date.parse(c.resolvedAt) < Date.parse(c.asOf)) {
        err(`${at}: resolvedAt precedes asOf — a forecast cannot resolve before its source exists`)
      }
    }

    byProvenance.set(c.provenance, (byProvenance.get(c.provenance) ?? 0) + 1)
  }
  console.log('')
}

console.log(`${total} claim(s) across ${files.length} file(s)`)
for (const [p, n] of [...byProvenance.entries()].sort((a, b) => b[1] - a[1])) {
  console.log(`  ${String(n).padStart(3)}  ${p}`)
}
console.log('')
if (warnings) console.log(`${warnings} warning(s).`)
if (errors) {
  console.log(`${errors} failure(s).`)
  process.exit(1)
}
console.log('Claims ledger valid.')
