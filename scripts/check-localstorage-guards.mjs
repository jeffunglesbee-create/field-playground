#!/usr/bin/env node
// A third real bug class, found by hand-auditing (not assumed) every
// current localStorage call site in the codebase 2026-08-03: a raw
// localStorage.getItem/setItem/removeItem call can throw for real
// reasons (Safari private browsing historically threw on any access,
// quota exceeded, storage disabled by the user or environment) -- and
// every OTHER module that touches localStorage in this codebase
// already wraps every call in try/catch for exactly that reason
// (src/components/LocalNoteLayer, src/components/GameSymphonyArchive,
// src/components/PickEm, src/data/teamAffinity.js, src/data/myServices.js,
// src/data/beatTheModel.js -- all audited directly, all already
// correct). One module doesn't: src/data/outcomes.js -- its own
// `load()` helper is guarded, but setOutcome/clearOutcome/
// clearAllOutcomes/setConfidence/clearConfidence/setAnnotation/the
// BroadcastChannel sync handler all call localStorage.setItem
// directly, unguarded (10 real call sites). outcomes.js is read
// directly by 4 other components per its own header comment, so this
// is live, load-bearing pick-tracking code, not a rarely-hit path.
//
// Scans every file under src/ for localStorage.getItem/setItem/
// removeItem calls that occur OUTSIDE any try { ... } block in the
// same file, using brace-depth matching to find try-block ranges (same
// manual-parsing technique already used in check-resource-safety.mjs's
// splitTopLevelArgs).
//
// VALIDATED, not just reasoned about: reproduced the exact shape (an
// unguarded setItem call in a throwaway module) and confirmed it's
// caught; confirmed a call correctly wrapped in try/catch is NOT
// flagged, including the one-line `try { localStorage.setItem(...) }
// catch { ... }` style used throughout this codebase.
//
// KNOWN, HONEST LIMITATION: brace-depth matching is naive text
// scanning, not a real parser -- a `try` keyword inside a string or
// comment immediately followed by `{` could in principle confuse it.
// Not seen in this codebase's real style (checked directly), but a
// real blind spot if introduced.

import { readFileSync, readdirSync } from 'node:fs'
import { join, extname } from 'node:path'

const REPO_ROOT = new URL('..', import.meta.url).pathname
const SRC_DIR = join(REPO_ROOT, 'src')

function findTryRanges(src) {
  const ranges = []
  const tryRe = /\btry\s*\{/g
  let m
  while ((m = tryRe.exec(src))) {
    let depth = 1
    let i = m.index + m[0].length
    for (; i < src.length && depth > 0; i++) {
      if (src[i] === '{') depth++
      else if (src[i] === '}') depth--
    }
    ranges.push([m.index, i])
  }
  return ranges
}

function checkFile(filePath) {
  const src = readFileSync(filePath, 'utf-8')
  const tryRanges = findTryRanges(src)
  const violations = []
  const callRe = /localStorage\.(getItem|setItem|removeItem)\(/g
  let m
  while ((m = callRe.exec(src))) {
    const guarded = tryRanges.some(([s, e]) => m.index >= s && m.index < e)
    if (!guarded) {
      const lineNum = src.slice(0, m.index).split('\n').length
      violations.push({ line: lineNum, method: m[1] })
    }
  }
  return violations
}

function walk(dir, out) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) walk(full, out)
    else if (extname(entry.name) === '.js' || extname(entry.name) === '.jsx') out.push(full)
  }
}

function main() {
  const files = []
  walk(SRC_DIR, files)

  const allViolations = []
  for (const f of files) {
    const rel = 'src' + f.slice(SRC_DIR.length)
    for (const v of checkFile(f)) allViolations.push({ file: rel, ...v })
  }

  if (allViolations.length) {
    console.error('VIOLATIONS (unguarded localStorage call) -- this call can throw (Safari private browsing, quota exceeded, storage disabled) and has no try/catch anywhere around it in this file:')
    for (const v of allViolations) {
      console.error(`  ${v.file}:${v.line} -- localStorage.${v.method}(...) -- wrap in try/catch, matching every other localStorage consumer in this codebase`)
    }
    process.exit(1)
  } else {
    console.log('No unguarded localStorage calls found.')
  }
}

main()
