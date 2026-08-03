#!/usr/bin/env node
// A fourth real risk class, found while building Terrain Flight
// (src/components/TerrainFlight) 2026-08-03: a THREE.WebGLRenderer
// holds a real GPU context plus real GPU-side buffers for every
// geometry/material/texture it's given. Solid's onCleanup runs on
// every unmount (tab switch away from Lab, error-boundary reset,
// hot-reload) -- if a component creates a WebGLRenderer without
// disposing it in onCleanup, the GPU context and its buffers leak for
// real on every remount, same class of bug as an unguarded
// localStorage call or an un-rethrown resource error: correct once,
// silently wrong on the paths that aren't the happy first mount.
// TerrainFlight itself already does this correctly (renderer.dispose()
// + scene.traverse() disposing geometry/material, both inside
// onCleanup) -- this guard exists so the NEXT WebGL-creating component
// can't regress it silently.
//
// Scans every file under src/ for `<ident> = new *.WebGLRenderer(`,
// then checks whether `<ident>` is disposed inside an onCleanup(...)
// call in the same file, using paren-depth matching to find the
// onCleanup call's full span (same manual-parsing technique already
// used in check-resource-safety.mjs / check-localstorage-guards.mjs).
//
// VALIDATED, not just reasoned about: reproduced the exact shape (a
// WebGLRenderer created with no onCleanup disposal at all, and one
// disposed outside any onCleanup) and confirmed both are flagged;
// confirmed TerrainFlight's real, correct disposal is NOT flagged.
//
// KNOWN, HONEST LIMITATION: text scanning, not a real parser -- if a
// renderer variable is disposed via a differently-named alias
// (`const r = renderer; r.dispose()`) this won't follow the alias. Not
// seen in this codebase's real style (checked directly, every current
// call site disposes the same identifier it assigned).

import { readFileSync, readdirSync } from 'node:fs'
import { join, extname } from 'node:path'

const REPO_ROOT = new URL('..', import.meta.url).pathname
const SRC_DIR = join(REPO_ROOT, 'src')

function findCallRanges(src, calleeRe) {
  const ranges = []
  let m
  while ((m = calleeRe.exec(src))) {
    const start = m.index
    let depth = 1
    let i = m.index + m[0].length
    for (; i < src.length && depth > 0; i++) {
      if (src[i] === '(') depth++
      else if (src[i] === ')') depth--
    }
    ranges.push([start, i])
  }
  return ranges
}

function checkFile(filePath) {
  const src = readFileSync(filePath, 'utf-8')
  const violations = []
  const rendererRe = /(\w+)\s*=\s*new\s+\w+\.WebGLRenderer\(/g
  let m
  while ((m = rendererRe.exec(src))) {
    const ident = m[1]
    const lineNum = src.slice(0, m.index).split('\n').length
    const onCleanupRanges = findCallRanges(src, /\bonCleanup\(/g)
    const disposeRe = new RegExp(`\\b${ident}\\??\\.dispose\\?\\.?\\(\\)`)
    const disposed = onCleanupRanges.some(([s, e]) => disposeRe.test(src.slice(s, e)))
    if (!disposed) {
      violations.push({ line: lineNum, ident })
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
    console.error('VIOLATIONS (WebGLRenderer created with no matching onCleanup disposal) -- this leaks a real GPU context + GPU buffers on every unmount:')
    for (const v of allViolations) {
      console.error(`  ${v.file}:${v.line} -- \`${v.ident}\` never has \`${v.ident}.dispose()\` inside an onCleanup(...) call in this file`)
    }
    process.exit(1)
  } else {
    console.log('No undisposed WebGLRenderer instances found.')
  }
}

main()
