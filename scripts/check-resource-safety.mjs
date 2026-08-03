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
// WHAT THIS DOES NOT CATCH, stated honestly rather than silently:
//   - The other real manifestation of the same bug (a bare resource
//     accessor called directly in JSX, e.g. `<Show when={resource()}>`,
//     without a preceding `.error` check) -- reliably distinguishing a
//     safe render-prop call (`d()` inside `{d => ...}`) from an unsafe
//     direct resource call needs real scope tracking, not a regex.
//     Caught by code review / artifact-check.yml's real render test
//     instead.
//   - Resources imported under a renamed local binding (`import {
//     ambientData as ad }`) -- not seen in this codebase today, but a
//     real blind spot if introduced.
//   - Single-argument `createResource(fetcher)` calls, which don't have
//     a separate source-read step at all and so can't exhibit this
//     specific risk.

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

function main() {
  const relaySource = readFileSync(RELAY_PATH, 'utf-8')
  const resourceNames = findResourceNames(relaySource)
  console.log(`Real createResource accessors found in relay.js: ${[...resourceNames].join(', ')}`)
  console.log('')

  const allViolations = []
  for (const dir of readdirSync(COMPONENTS_DIR, { withFileTypes: true })) {
    if (!dir.isDirectory()) continue
    const indexPath = join(COMPONENTS_DIR, dir.name, 'index.jsx')
    try {
      const violations = checkFile(indexPath, resourceNames)
      for (const v of violations) allViolations.push({ file: `src/components/${dir.name}/index.jsx`, ...v })
    } catch (e) {
      if (e.code !== 'ENOENT') throw e
    }
  }

  if (allViolations.length) {
    console.error('VIOLATIONS FOUND -- a real resource accessor is passed directly as a createResource source:')
    for (const v of allViolations) {
      console.error(`  ${v.file}:${v.line} -- createResource(${v.resource}, ...) -- wrap with safeResource(${v.resource}, fallback) from src/data/safeResource.js`)
    }
    process.exit(1)
  }

  console.log('Clean: no bare resource accessor found as a createResource source.')
}

main()
