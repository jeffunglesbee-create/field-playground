#!/usr/bin/env node
// Automated guard for a bug class independently hand-fixed 4+ times
// this session (see docs/outbox/cc-session-2026-08-02-followup-fixes.md,
// src/data/safeResource.js): a Solid `createResource` accessor re-throws
// if its own resource is in an error state, rather than returning
// safely -- so passing one directly as ANOTHER resource's `source`
// parameter crashes the moment the underlying resource has genuinely
// errored, before the new resource's own fetcher ever gets a chance to
// check `.error`.
//
// WHAT THIS CATCHES: `createResource(bareResourceIdentifier, fetcher)`
// where `bareResourceIdentifier` is a real resource exported from
// relay.js (found dynamically by reading relay.js itself, not
// hardcoded -- stays correct as relay.js grows) and is NOT wrapped in
// `safeResource(...)` or a function.
//
// SECOND CHECK, added 2026-08-02 (same file, same run): a heuristic
// guard for the OTHER real manifestation -- a resource called directly
// in JSX/a memo (e.g. `<Show when={resource()}>`) with no error
// handling anywhere in the file at all. True control-flow analysis
// (does THIS specific call site only execute when `.error` is falsy?)
// needs a real AST and scope tracking, which this deliberately does not
// attempt -- every instance of this bug actually found this session
// looked like "never checked `.error` for this resource anywhere in the
// file," not "checked it in the wrong place." A file-wide co-occurrence
// check (resource called as a function AND `.error` never referenced
// for it anywhere, AND never routed through `safeResource(...)`) covers
// that real shape with a much lower false-positive rate than trying to
// be precise, at the honest cost of being unable to catch a resource
// whose `.error` IS checked somewhere in the file but doesn't actually
// gate every unsafe call site.
//
// WHAT NEITHER CHECK CATCHES, stated honestly rather than silently:
//   - A resource whose `.error` is checked somewhere in the file but
//     doesn't actually gate every direct call site (needs real
//     control-flow analysis).
//   - Resources imported under a renamed local binding (`import {
//     ambientData as ad }`) -- not seen in this codebase today, but a
//     real blind spot if introduced.
//   - Single-argument `createResource(fetcher)` calls, which don't have
//     a separate source-read step at all and so can't exhibit the
//     first check's specific risk.
//   - Anything outside `src/components/*/index.jsx` (helper modules
//     under a component's own directory, `src/data/*.js` consumers).

import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

const REPO_ROOT = new URL('..', import.meta.url).pathname
const RELAY_PATH = join(REPO_ROOT, 'src/data/relay.js')
const COMPONENTS_DIR = join(REPO_ROOT, 'src/components')

function findResourceNames(relaySource) {
  const names = new Set()
  const re = /export const \[(\w+)(?:,\s*\{[^}]*\})?\]\s*=\s*createResource\(/gs
  let m
  while ((m = re.exec(relaySource))) names.add(m[1])
  return names
}

// Given the text immediately after a `createResource(`, splits its
// argument list on top-level commas (respecting nested (), {}, []) and
// returns the raw argument strings.
function splitTopLevelArgs(text) {
  const args = []
  let depth = 0
  let current = ''
  let i = 0
  for (; i < text.length; i++) {
    const c = text[i]
    if (c === '(' || c === '{' || c === '[') depth++
    else if (c === ')' || c === '}' || c === ']') {
      if (depth === 0) break // the createResource(...) call's own closing paren
      depth--
    }
    if (c === ',' && depth === 0) {
      args.push(current)
      current = ''
      continue
    }
    current += c
  }
  args.push(current)
  return { args, endIndex: i }
}

function checkFile(filePath, resourceNames) {
  const src = readFileSync(filePath, 'utf-8')
  const violations = []
  const callRe = /createResource\(/g
  let m
  while ((m = callRe.exec(src))) {
    const after = src.slice(m.index + m[0].length)
    const { args } = splitTopLevelArgs(after)
    if (args.length < 2) continue // single-arg form has no separate source
    const firstArg = args[0].trim()
    if (resourceNames.has(firstArg)) {
      const lineNum = src.slice(0, m.index).split('\n').length
      violations.push({ line: lineNum, resource: firstArg })
    }
  }
  return violations
}

// Second check: does this file call `resourceName(` anywhere, while
// never referencing `resourceName.error` and never routing the call
// through `safeResource(resourceName, ...)`?
function checkUnguardedDirectCalls(filePath, resourceNames) {
  const src = readFileSync(filePath, 'utf-8')
  const violations = []
  for (const name of resourceNames) {
    const calledRe = new RegExp(`\\b${name}\\s*\\(`)
    if (!calledRe.test(src)) continue // never called as a function at all -- nothing to guard

    const errorCheckRe = new RegExp(`\\b${name}\\.error\\b`)
    const wrappedRe = new RegExp(`safeResource\\(\\s*${name}\\b`)
    if (errorCheckRe.test(src) || wrappedRe.test(src)) continue // guarded somewhere

    violations.push({ resource: name })
  }
  return violations
}

function main() {
  const relaySource = readFileSync(RELAY_PATH, 'utf-8')
  const resourceNames = findResourceNames(relaySource)
  console.log(`Real createResource accessors found in relay.js: ${[...resourceNames].join(', ')}`)
  console.log('')

  const sourceViolations = []
  const directCallViolations = []
  for (const dir of readdirSync(COMPONENTS_DIR, { withFileTypes: true })) {
    if (!dir.isDirectory()) continue
    const relPath = `src/components/${dir.name}/index.jsx`
    const indexPath = join(COMPONENTS_DIR, dir.name, 'index.jsx')
    let src
    try {
      src = readFileSync(indexPath, 'utf-8')
    } catch (e) {
      if (e.code === 'ENOENT') continue
      throw e
    }

    for (const v of checkFile(indexPath, resourceNames)) sourceViolations.push({ file: relPath, ...v })
    for (const v of checkUnguardedDirectCalls(indexPath, resourceNames)) directCallViolations.push({ file: relPath, ...v })
  }

  let failed = false

  if (sourceViolations.length) {
    failed = true
    console.error('VIOLATIONS (createResource source parameter) -- a real resource accessor is passed directly as a createResource source:')
    for (const v of sourceViolations) {
      console.error(`  ${v.file}:${v.line} -- createResource(${v.resource}, ...) -- wrap with safeResource(${v.resource}, fallback) from src/data/safeResource.js`)
    }
  } else {
    console.log('Check 1 clean: no bare resource accessor found as a createResource source.')
  }

  if (directCallViolations.length) {
    failed = true
    console.error('')
    console.error('VIOLATIONS (unguarded direct call) -- a real resource is called as a function but its .error is never checked anywhere in the file, and it is never routed through safeResource(...):')
    for (const v of directCallViolations) {
      console.error(`  ${v.file} -- calls ${v.resource}() somewhere with no .error handling anywhere in the file -- guard with safeResource(${v.resource}, fallback) or an inline (${v.resource}.error ? fallback : ${v.resource}()) check`)
    }
  } else {
    console.log('Check 2 clean: every directly-called resource has .error handling somewhere in its file.')
  }

  if (failed) process.exit(1)
}

main()
