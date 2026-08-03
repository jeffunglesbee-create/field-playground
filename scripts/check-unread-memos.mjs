#!/usr/bin/env node
// A different real, documented Solid.js bug class from this session's
// own history: DramaSoundscape's real bug (found 2026-07-31, user
// report "soundboard doesn't play live") was a bare `createMemo(...)`
// whose return value nothing ever called. Solid's memos are lazy/
// pull-based -- with zero consumers, a memo runs exactly once at
// creation and never re-runs, silently. `createEffect` is the correct
// primitive for a side-effect-only computation; a memo used that way
// looks like it works (no error, no warning) but is actually dead.
//
// Scans for `const NAME = createMemo(` declarations where `NAME` never
// appears again anywhere else in the same file -- neither called
// (`NAME()`) nor referenced bare (`<Child prop={NAME} />`, which counts
// as "used" since a child COULD call it). Validated, not just reasoned
// about: reproducing the exact historical bug shape (a memo used only
// for a side effect, return value never read) is caught; a legitimate
// bare-prop-passing memo (`<Child data={derived} />`) is correctly NOT
// flagged, since `usedBare` already matches that case. Zero violations
// found against the real, current codebase before this was wired into
// CI.
//
// KNOWN, HONEST LIMITATION: a memo's accessor exported from its file
// and called only from ANOTHER file would be invisible to this
// single-file scan -- not seen anywhere in this codebase's actual
// local-memo patterns today, but a real blind spot if introduced.

import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

const REPO_ROOT = new URL('..', import.meta.url).pathname
const COMPONENTS_DIR = join(REPO_ROOT, 'src/components')

function checkFile(filePath) {
  const src = readFileSync(filePath, 'utf-8')
  const violations = []
  const declRe = /const\s+(\w+)\s*=\s*createMemo\(/g
  let m
  while ((m = declRe.exec(src))) {
    const name = m[1]
    // Any OTHER occurrence of `name(` in the file (a real call), or a
    // bare `name}`/`name,`/`name)` reference (passed elsewhere without
    // calling it here -- could still be called downstream, so treated
    // as "used" to keep this conservative).
    const afterDecl = src.slice(m.index + m[0].length)
    const usedAsCall = new RegExp(`\\b${name}\\s*\\(`).test(afterDecl)
    const usedBare = new RegExp(`[^\\w]${name}\\s*[,}\\)\\]]`).test(afterDecl)
    if (!usedAsCall && !usedBare) {
      const lineNum = src.slice(0, m.index).split('\n').length
      violations.push({ line: lineNum, name })
    }
  }
  return violations
}

function main() {
  const allViolations = []
  for (const dir of readdirSync(COMPONENTS_DIR, { withFileTypes: true })) {
    if (!dir.isDirectory()) continue
    const indexPath = join(COMPONENTS_DIR, dir.name, 'index.jsx')
    try {
      const violations = checkFile(indexPath)
      for (const v of violations) allViolations.push({ file: `src/components/${dir.name}/index.jsx`, ...v })
    } catch (e) {
      if (e.code !== 'ENOENT') throw e
    }
  }

  if (allViolations.length) {
    console.error('VIOLATIONS (unread createMemo) -- a memo is declared but its accessor is never called or referenced again in the same file, so Solid never re-runs it after creation:')
    for (const v of allViolations) {
      console.error(`  ${v.file}:${v.line} -- const ${v.name} = createMemo(...) -- call ${v.name}() somewhere, pass it as a prop, or use createEffect instead if this is a side effect`)
    }
    process.exit(1)
  } else {
    console.log('No unread createMemo declarations found.')
  }
}

main()
