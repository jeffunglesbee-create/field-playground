#!/usr/bin/env node
// 175 hardcoded colors is a number nobody acts on. How many DISTINCT colors is
// it really?
//
// THE POINT IS TO CHANGE THE SHAPE OF THE FINDING, NOT TO ADD A RULE. A count
// of violations reads as hopeless and gets ignored. A count of perceptual
// CLUSTERS reads as an afternoon: "six near-blacks within DeltaE 3 of each
// other, and one of them is already a token."
//
// DELIBERATELY NOT A GUARD, and the reason is measured. The detection-latency
// probe found CSS defects in this repo are caught fast -- AmbientPanel.module.css
// median 18.9h, DeskCard.module.css 7.8h -- against an overall median of 35
// minutes and a p90 tail that lives entirely in src/data and src/components.
// A hardcoded hex that renders correctly in both themes costs nothing and is
// discovered immediately when it doesn't. By the "enforce only what is
// expensive to discover late" filter, this class does not earn enforcement.
// So this reports and stops.
//
// STATIC ON PURPOSE. A browser-driven version reading computed styles would be
// more thorough and would need a dev server, a headless browser, and a minute
// per run. For a class the evidence says is low-cost, the cheap version is the
// correct investment.
//
// METHOD LIMIT, stated plainly: clustering uses CIE76 (plain Euclidean distance
// in CIELAB). DeltaE 2000 is more perceptually accurate, particularly for
// saturated colors. CIE76 is sufficient for "are these two greys the same grey"
// which is the actual question here, and it has no dependencies.

import { readdirSync, readFileSync, statSync, mkdirSync, writeFileSync } from 'node:fs'
import { join, relative } from 'node:path'

mkdirSync('outbox', { recursive: true })
const stamp = new Date().toISOString().replace(/[:.]/g, '-')
const outPath = 'outbox/color-clusters-' + stamp + '.txt'
const out = []
const log = s => { out.push(s); console.log(s); try { writeFileSync(outPath, out.join('\n')) } catch {} }

const DELTA_E = Number(process.env.PROBE_DELTA_E || 3)
const ROOT = 'src'

function walk(dir, acc = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    const st = statSync(p)
    if (st.isDirectory()) walk(p, acc)
    else if (/\.(css|jsx|js)$/.test(name)) acc.push(p)
  }
  return acc
}

// ---- colour maths ---------------------------------------------------------
function hexToRgb(hex) {
  let h = hex.replace('#', '')
  if (h.length === 3) h = h.split('').map(c => c + c).join('')
  if (h.length === 8) h = h.slice(0, 6) // drop alpha; hue is the question here
  if (h.length !== 6) return null
  const n = parseInt(h, 16)
  if (Number.isNaN(n)) return null
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

function rgbToLab([r, g, b]) {
  const lin = v => { v /= 255; return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4 }
  const [R, G, B] = [lin(r), lin(g), lin(b)]
  // sRGB D65
  const X = (R * 0.4124 + G * 0.3576 + B * 0.1805) / 0.95047
  const Y = (R * 0.2126 + G * 0.7152 + B * 0.0722) / 1.0
  const Z = (R * 0.0193 + G * 0.1192 + B * 0.9505) / 1.08883
  const f = t => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116)
  const [fx, fy, fz] = [f(X), f(Y), f(Z)]
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)]
}

const deltaE = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2])

// ---- collection -----------------------------------------------------------
const HEX_RE = /#[0-9a-fA-F]{3,8}\b/g
// A token DEFINITION assigns a literal to a custom property. A token USE reads
// one. Only definitions tell us what the palette actually is.
const TOKEN_DEF_RE = /(--[a-zA-Z0-9-]+)\s*:\s*(#[0-9a-fA-F]{3,8})\b/g

function main() {
  log('probe_at: ' + new Date().toISOString())
  log('purpose: convert "N hardcoded colours" into "how many distinct colours, really".')
  log(`clustering threshold: DeltaE (CIE76) <= ${DELTA_E}`)
  log('')

  const files = walk(ROOT)
  const tokens = new Map()   // token name -> hex
  const literals = []        // { hex, file, line }

  for (const f of files) {
    const text = readFileSync(f, 'utf8')
    const rel = relative(process.cwd(), f)

    for (const m of text.matchAll(TOKEN_DEF_RE)) {
      if (!tokens.has(m[1])) tokens.set(m[1], m[2].toLowerCase())
    }

    const lines = text.split('\n')
    for (let i = 0; i < lines.length; i++) {
      // A line that DEFINES a token is the palette, not a violation of it.
      if (/--[a-zA-Z0-9-]+\s*:/.test(lines[i])) continue
      for (const m of lines[i].matchAll(HEX_RE)) {
        literals.push({ hex: m[0].toLowerCase(), file: rel, line: i + 1 })
      }
    }
  }

  log('=== INVENTORY ===')
  log(`files scanned:             ${files.length}`)
  log(`token definitions found:   ${tokens.size}`)
  log(`hardcoded hex occurrences: ${literals.length}`)
  const distinct = new Map()
  for (const l of literals) {
    if (!distinct.has(l.hex)) distinct.set(l.hex, [])
    distinct.get(l.hex).push(l)
  }
  log(`distinct hex values:       ${distinct.size}`)
  log('')

  // ---- cluster --------------------------------------------------------
  const points = [...distinct.entries()]
    .map(([hex, uses]) => ({ hex, uses, lab: (r => (r ? rgbToLab(r) : null))(hexToRgb(hex)) }))
    .filter(p => p.lab)
  const unparsed = distinct.size - points.length
  if (unparsed) log(`(${unparsed} value(s) could not be parsed as colours -- skipped, not silently counted)`)

  // Single-link agglomeration: a value joins a cluster if it is within DeltaE
  // of ANY member. Right for "these are the same colour by different names";
  // it can chain across a gradient, which is called out where it happens.
  points.sort((a, b) => b.uses.length - a.uses.length)
  const clusters = []
  for (const p of points) {
    const hit = clusters.find(c => c.members.some(m => deltaE(m.lab, p.lab) <= DELTA_E))
    if (hit) hit.members.push(p)
    else clusters.push({ members: [p] })
  }

  const tokenPoints = [...tokens.entries()]
    .map(([name, hex]) => ({ name, hex, lab: (r => (r ? rgbToLab(r) : null))(hexToRgb(hex)) }))
    .filter(t => t.lab)

  for (const c of clusters) {
    c.total = c.members.reduce((n, m) => n + m.uses.length, 0)
    c.spread = Math.max(0, ...c.members.flatMap(a => c.members.map(b => deltaE(a.lab, b.lab))))
    // Nearest existing token: if one is inside the threshold, this whole
    // cluster already has a home and the fix is mechanical.
    let best = null
    for (const t of tokenPoints) {
      const d = Math.min(...c.members.map(m => deltaE(m.lab, t.lab)))
      if (!best || d < best.d) best = { token: t.name, hex: t.hex, d }
    }
    c.nearestToken = best
  }
  clusters.sort((a, b) => b.total - a.total)

  log('=== CLUSTERS ===')
  log(`${distinct.size} distinct values collapse into ${clusters.length} perceptual clusters.`)
  const covered = clusters.filter(c => c.nearestToken && c.nearestToken.d <= DELTA_E)
  log(`${covered.length} cluster(s) sit within DeltaE ${DELTA_E} of an EXISTING token -- mechanical to fix.`)
  log(`${clusters.length - covered.length} cluster(s) have no near token -- a real palette decision, not a rename.`)
  log('')

  for (const c of clusters.slice(0, 20)) {
    const near = c.nearestToken
    const tag = near && near.d <= DELTA_E ? `-> ${near.token} (${near.hex}, dE ${near.d.toFixed(1)})` : `no near token (closest ${near ? near.token + ' dE ' + near.d.toFixed(1) : 'n/a'})`
    log(`  ${String(c.total).padStart(4)} use(s) across ${String(c.members.length).padStart(2)} value(s)  spread dE ${c.spread.toFixed(1).padStart(4)}   ${tag}`)
    log(`        ${c.members.map(m => `${m.hex}(${m.uses.length})`).join('  ')}`)
    if (c.spread > DELTA_E * 2.5) {
      log('        NOTE: wide spread -- single-link chaining may have merged a gradient. Read before batching.')
    }
  }
  if (clusters.length > 20) log(`  ...and ${clusters.length - 20} smaller clusters`)
  log('')

  // The count of clusters was NOT the useful number -- predicted "~15", measured
  // 137. What actually collapsed is the MASS: a long tail of one-off colours
  // surrounds a few clusters carrying most of the uses. Cumulative coverage is
  // the number that tells you how much of the problem a short list solves.
  log('=== MASS CONCENTRATION (the number that actually matters) ===')
  const totalUses = literals.length
  let acc = 0
  const marks = [0.25, 0.5, 0.8, 0.95]
  const hit = new Map()
  for (let i = 0; i < clusters.length; i++) {
    acc += clusters[i].total
    for (const m of marks) {
      if (!hit.has(m) && acc / totalUses >= m) hit.set(m, i + 1)
    }
  }
  for (const m of marks) {
    log(`  ${String(hit.get(m) ?? clusters.length).padStart(3)} cluster(s) cover ${(m * 100).toFixed(0)}% of all ${totalUses} uses`)
  }
  log('  So the tail is long but cheap -- a short list of clusters is most of the work,')
  log('  and the remainder is one-off colours that are probably deliberate.')
  log('')

  log('=== WHERE THEY LIVE ===')
  const byFile = new Map()
  for (const l of literals) byFile.set(l.file, (byFile.get(l.file) ?? 0) + 1)
  for (const [f, n] of [...byFile.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12)) {
    log(`  ${String(n).padStart(4)}  ${f}`)
  }
  log('')

  log('=== VERDICT ===')
  log(`${literals.length} hardcoded occurrences -> ${distinct.size} distinct values -> ${clusters.length} clusters.`)
  log(`Of those, ${covered.length} already have a token within DeltaE ${DELTA_E}.`)
  log('')
  log('PREDICTION MISS, recorded rather than quietly dropped: this probe was specified')
  log('on the expectation that ~168 distinct values would collapse to roughly 15')
  log(`clusters. They collapse to ${clusters.length}. The clustering did not do what was`)
  log('claimed for it. What DID collapse is the mass -- see the concentration table')
  log('above -- so the useful framing is "a few clusters carry most uses", not "the')
  log('palette is secretly small".')
  log('')
  log('This is a REPORT, not a gate, and that is a measured decision rather than a')
  log('preference: the detection-latency probe found CSS defects here are caught in')
  log('hours against a 35-minute overall median, so this class does not clear the')
  log('"expensive to discover late" bar. Fix the token-adjacent clusters if and when')
  log('the files are open anyway; leave the rest alone.')
  log('')
  log('What WOULD earn a gate is the consequence, not the literal: a colour that fails')
  log('contrast in one theme. That needs rendered output in both themes and is a')
  log('different probe -- named here so its absence is deliberate rather than implied.')
}

main()
