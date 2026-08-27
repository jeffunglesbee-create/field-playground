#!/usr/bin/env node
// The unslop-ui checklist, counted and ratcheted. Ported from jubilant-bassoon
// 2026-08-27, adapted for a multi-file app rather than a single-file PWA.
//
// WHY THIS EXISTS HERE. The audit that took jubilant-bassoon from 275 decorative
// emoji to 4 never looked at this repo, and an unmeasured codebase is where the
// next 275 accumulates. Same format, same ratchet discipline, same file name so
// the two are recognisably one thing.
//
// WHAT IS DIFFERENT FROM THE ORIGINAL. jubilant-bassoon is one index.html with a
// single <style> block; this is 82 CSS files and 124 source files under src/.
// So the corpus is BUILT rather than sliced: every .css joined for the style
// counters, every .js/.jsx/.ts/.tsx/.html joined for the glyph counters. The
// original had to learn to look past its one file (2026-08-27); this one starts
// there.
//
// Usage:  node scripts/check-chrome-inventory.mjs [--self-test]

import { readFileSync, readdirSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const IS_MAIN = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]
const SELF_TEST = IS_MAIN && process.argv.includes('--self-test')
const INVENTORY = 'docs/chrome-inventory.txt'

export function walkFiles(root, re) {
  const out = []
  const walk = d => { for (const e of readdirSync(d, { withFileTypes: true })) {
    const p = join(d, e.name)
    if (e.isDirectory()) { if (e.name !== 'node_modules' && e.name !== 'dist') walk(p); continue }
    if (re.test(e.name)) out.push(p)
  } }
  try { walk(root) } catch { /* absent tree is not an error */ }
  return out
}

/// Comments stripped, for the reason the original learned twice: a counter that
/// reads prose ABOUT the page measures mentions. Deleting three gradient rules
/// there dropped the gradient count by TWO, because the comment explaining the
/// deletion says `linear-gradient`.
export const stripComments = t => t
  .replace(/\/\*[\s\S]*?\*\//g, ' ')
  .replace(/<!--[\s\S]*?-->/g, ' ')
  .split('\n').filter(l => !/^\s*(\/\/|\*(?!\/))/.test(l)).join('\n')

/// Unicode escapes decoded, because a ratchet a spelling can bypass is not a
/// ratchet. `\u{1F3C0}` counted as nothing there until 24 glyphs were found
/// hiding behind it.
export const decodeEscapes = t => t.replace(/\\u\{([0-9a-fA-F]{1,6})\}|\\u([0-9a-fA-F]{4})/g,
  (m, a, b) => { const cp = parseInt(a || b, 16); return cp > 0x10FFFF ? m : String.fromCodePoint(cp) })

const EMOJI = /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}]/gu
const FLAG = c => { const p = c.codePointAt(0); return p >= 0x1F1E6 && p <= 0x1F1FF }
const STATUS = new Set(['✓', '✕', '✔', '✖', '⚠', '★', '☆'])

export function emojiCensus(body) {
  const out = { flags: 0, status: 0, decorative: 0, distinct: new Set() }
  for (const m of body.matchAll(EMOJI)) {
    const c = m[0]
    if (FLAG(c)) out.flags++
    else if (STATUS.has(c)) out.status++
    else { out.decorative++; out.distinct.add(c) }
  }
  return out
}

/// A shadow is "coloured" when a channel is above 40. Black at low alpha is
/// elevation; violet is decoration, and item 6 draws exactly that line.
export function colouredShadows(css) {
  let n = 0
  for (const m of css.matchAll(/box-shadow:([^;}]*)/g)) {
    const v = m[1]
    if (/#[0-9a-f]{3,8}/i.test(v)) { n++; continue }
    for (const c of v.matchAll(/rgba?\(([^)]*)\)/g)) {
      const [r, g, b] = c[1].split(',').map(Number)
      if ([r, g, b].some(x => x > 40)) { n++; break }
    }
  }
  return n
}

/// Checklist item 2 made mechanical: a small square box, a corner radius, a REAL
/// fill, and flex centring. `background:none` is not a coloured box — testing
/// only for `/background/` flagged an unfilled chevron control in the original.
export function iconBoxes(css) {
  const out = []
  for (const m of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const sel = m[1].replace(/\s+/g, ' ').trim(), b = m[2]
    const w = /(?:^|;)\s*width:\s*(\d+)px/.exec(b), h = /(?:^|;)\s*height:\s*(\d+)px/.exec(b)
    if (!w || !h) continue
    const W = +w[1], H = +h[1]
    if (W > 56 || H > 56 || Math.abs(W - H) > 4) continue
    if (!/border-radius/.test(b)) continue
    const fill = /(?:^|;)\s*background(?:-color|-image)?:\s*([^;]+)/.exec(b)
    if (!fill || /^\s*(none|transparent|inherit|initial)\s*$/.test(fill[1])) continue
    if (!/align-items:\s*center/.test(b) && !/justify-content:\s*center/.test(b)) continue
    out.push(sel)
  }
  return out
}

export function countsFor(cssText, bodyText) {
  const css = stripComments(cssText)
  const body = decodeEscapes(stripComments(bodyText))
  const e = emojiCensus(body)
  const n = (re, s) => (s.match(re) || []).length
  return {
    'decorative-emoji': e.decorative,
    'flag-emoji': e.flags,
    'status-glyph': e.status,
    'gradient': n(/linear-gradient|radial-gradient/g, css),
    'gradient-text': n(/background-clip:\s*text|-webkit-background-clip/g, css),
    'backdrop-filter': n(/backdrop-filter/g, css),
    'coloured-shadow': colouredShadows(css),
    'keyframes': n(/@keyframes/g, css),
    'icon-in-a-box': iconBoxes(css).length,
  }
}

/// `<max> <name>`, comments and blanks ignored. Same shape as the sibling repo's.
export function parseInventory(text) {
  const out = new Map()
  for (const line of text.split('\n')) {
    const t = line.replace(/#.*$/, '').trim()
    if (!t) continue
    const [max, name] = t.split(/\s+/)
    if (name) out.set(name, Number(max))
  }
  return out
}

// ── self-test ───────────────────────────────────────────────────────────────

if (SELF_TEST) {
  let failed = 0
  const check = (label, ok, detail = '') => {
    console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${ok || !detail ? '' : `\n      → ${detail}`}`)
    if (!ok) failed++
  }
  const C = (css, body = '') => countsFor(css, body)

  check('a comment naming a gradient is not a gradient',
    C('/* the linear-gradient was deleted */ a{color:red}').gradient === 0,
    'documenting a deletion would partly undo it')
  check('a real gradient counts', C('a{background:linear-gradient(red,blue)}').gradient === 1)
  check('a line comment naming a glyph is not a glyph',
    C('', '// the 📰 icon went here')['decorative-emoji'] === 0)
  check('a URL survives the line-comment rule',
    stripComments('const u = "https://example.com"').includes('https://example.com'),
    'a naive // strip would eat every URL')
  check('an escaped glyph is decoded and counted',
    C('', 'const i = "\\u{1F3C0}"')['decorative-emoji'] === 1,
    'a ratchet a spelling can bypass is not a ratchet')
  // A flag is TWO regional-indicator codepoints, so one flag counts 2. Written
  // as === 1 first and the run said otherwise; the counter was right.
  check('a flag is its own category, counted per codepoint',
    C('', '🇪🇸')['flag-emoji'] === 2 && C('', '🇪🇸')['decorative-emoji'] === 0)
  check('a status glyph is its own category', C('', '✓ ⚠')['status-glyph'] === 2)
  check('a black shadow is elevation', colouredShadows('a{box-shadow:0 4px 24px rgba(0,0,0,.4)}') === 0)
  check('a violet shadow is decoration', colouredShadows('a{box-shadow:0 0 12px rgba(167,139,250,.5)}') === 1)
  check('a small filled rounded flex-centred box IS the pattern',
    iconBoxes('.x{width:30px;height:30px;border-radius:6px;background:#111;display:flex;align-items:center}').length === 1)
  check('an UNFILLED bordered control is not',
    iconBoxes('.x{width:24px;height:24px;border-radius:4px;background:none;align-items:center}').length === 0)
  const inv = parseInventory('# note\n\n  12  gradient   # why\n3 keyframes\n')
  check('the inventory parser ignores comments and blanks',
    inv.get('gradient') === 12 && inv.size === 2)

  console.log(`\n${failed === 0 ? 'PASS' : 'FAIL'}  chrome inventory self-test: ${failed} failing`)
  process.exit(failed === 0 ? 0 : 1)
}

// ── live ────────────────────────────────────────────────────────────────────

if (IS_MAIN) {
  const cssFiles = walkFiles('src', /\.css$/)
  const bodyFiles = [...walkFiles('src', /\.(jsx?|tsx?|html)$/),
                     ...(existsSync('index.html') ? ['index.html'] : [])]
  const cssText = cssFiles.map(f => readFileSync(f, 'utf8')).join('\n')
  const bodyText = bodyFiles.map(f => readFileSync(f, 'utf8')).join('\n')

  const counts = countsFor(cssText, bodyText)
  const declared = parseInventory(readFileSync(INVENTORY, 'utf8'))

  let failed = 0
  // Vacuity guards. A run that read no files reports zero of everything and
  // means nothing by it — the original shipped exactly that bug and passed 5/5.
  const guard = (name, ok, detail) => {
    console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `\n      → ${detail}`}`)
    if (!ok) failed++
  }
  console.log(`\n  unslop-ui checklist, counted across ${cssFiles.length} CSS and ${bodyFiles.length} source file(s)\n`)
  guard('the CSS corpus was actually read', cssFiles.length > 5, `${cssFiles.length} file(s)`)
  guard('the source corpus was actually read', bodyFiles.length > 5, `${bodyFiles.length} file(s)`)

  for (const [name, n] of Object.entries(counts)) {
    const max = declared.get(name)
    if (max === undefined) {
      console.log(`  FAIL  ${name.padEnd(18)} ${String(n).padStart(4)}  — not declared in ${INVENTORY}`)
      failed++
    } else if (n > max) {
      console.log(`  FAIL  ${name.padEnd(18)} ${String(n).padStart(4)}  — declared at most ${max}. This is a RATCHET: a new one is the failure. If you REMOVED some, lower the number in ${INVENTORY} in this commit.`)
      failed++
    } else {
      console.log(`  ok    ${name.padEnd(18)} ${String(n).padStart(4)}  of ${max}${n < max ? '   ← lower this' : ''}`)
    }
  }
  console.log(`\n${failed === 0 ? 'PASS' : 'FAIL'}  ${failed} finding(s)`)
  process.exit(failed === 0 ? 0 : 1)
}
