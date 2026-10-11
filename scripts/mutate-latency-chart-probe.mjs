// Rule 90 for scripts/latency-chart-probe.mjs.
//
// field-playground docs/CC-CMD-2026-10-11-build-check-latency-probe-red.md,
// Task 3: break the thing the probe exists to catch, watch it go red, restore.
//
// WHY THIS IS NOT OPTIONAL HERE. That probe failed on every run from at least
// 2026-10-06 to 2026-10-11 and had never been seen to pass, so nothing it
// asserted had ever been exercised. Fixing the import made it print PASS — and
// a check whose only two states on record are "crashed before launching a
// browser" and "passed once" has still demonstrated nothing about its
// assertions.
//
// THE HARNESS ASSERTS ITS OWN ANCHORS. Each mutation checks that the anchor
// was present and unique before editing, and reports ANCHOR rather than a
// verdict when it is not. A harness that prints NOT CAUGHT without having
// mutated anything is worse than no test.
//
// Each mutation needs a REBUILD, because the probe reads the built dist/ via
// vite preview, not the source. ~9s each.
import { readFileSync, writeFileSync } from 'node:fs'
import { execFileSync, spawn } from 'node:child_process'

const PORT = process.env.MUTATE_PORT || '4178'
const URL_ = `http://localhost:${PORT}/`
const CHROMIUM = process.env.CHROMIUM_PATH || undefined

const MUTATIONS = [
  {
    name: 'M1 the chart mount loses the class the probe finds it by',
    file: 'src/components/LatencyHistogram/index.jsx',
    anchor: '<div class={styles.latencyChart} ref={chartEl} />',
    replace: '<div class={styles.latencyPlot} ref={chartEl} />',
    expect: 'no .latencyChart mount',
  },
  {
    name: 'M2 the canvas stops announcing itself to assistive tech',
    file: 'src/data/chart.js',
    anchor: "el.setAttribute('aria-label', `${data[0].length} points. ${parts.join('; ')}`)",
    replace: "void parts",
    expect: 'no aria-label',
  },
]

const build = () => execFileSync('npm', ['run', 'build'], { stdio: ['ignore', 'ignore', 'pipe'] })

let server = null
const startPreview = async () => {
  server = spawn('npx', ['vite', 'preview', '--port', PORT], { stdio: 'ignore', detached: true })
  for (let i = 0; i < 30; i++) {
    try { execFileSync('curl', ['-sf', '-o', '/dev/null', URL_]); return true } catch (_) {}
    await new Promise(r => setTimeout(r, 1000))
  }
  return false
}
const stopPreview = () => { if (server) { try { process.kill(-server.pid) } catch (_) {} server = null } }
process.on('exit', stopPreview)

const runProbe = () => {
  try {
    const out = execFileSync(process.execPath, ['scripts/latency-chart-probe.mjs'], {
      encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, PLAYGROUND_URL: URL_, ...(CHROMIUM ? { CHROMIUM_PATH: CHROMIUM } : {}) },
    })
    return { ok: true, out }
  } catch (e) { return { ok: false, out: `${e.stdout || ''}${e.stderr || ''}` } }
}

// ── the positive control, which has to come first ───────────────────────────
build()
if (!await startPreview()) { console.log('FAIL — vite preview never came up; no verdict below would mean anything.'); process.exit(1) }
const clean = runProbe()
if (!clean.ok) {
  console.log('FAIL — the probe is already red on clean source. Fix that before reading any mutation.')
  console.log(clean.out.slice(-800)); stopPreview(); process.exit(1)
}
console.log('baseline: the probe PASSES on clean source\n')

let caught = 0, wrong = 0, anchorFails = 0
for (const m of MUTATIONS) {
  const original = readFileSync(m.file, 'utf8')
  const hits = original.split(m.anchor).length - 1
  if (hits !== 1) {
    anchorFails++
    console.log(`  ANCHOR  ${m.name}`)
    console.log(`          the anchor appears ${hits} time(s) in ${m.file} — NOTHING WAS MUTATED, so there is no verdict here`)
    continue
  }
  writeFileSync(m.file, original.replace(m.anchor, m.replace))
  let verdict
  try {
    build()
    stopPreview()
    if (!await startPreview()) verdict = 'NO-PREVIEW'
    else {
      const r = runProbe()
      verdict = r.ok ? 'MISSED' : (r.out.includes(m.expect) ? 'CAUGHT' : 'RED-FOR-THE-WRONG-REASON')
      if (verdict !== 'CAUGHT') console.log(`          probe said: ${r.out.trim().split('\n').slice(-4).join(' | ').slice(0, 220)}`)
    }
  } catch (e) {
    // A mutation that breaks the BUILD proves nothing about the probe.
    verdict = 'BUILD-FAILED'
    console.log(`          ${String(e.message).split('\n')[0].slice(0, 160)}`)
  } finally {
    writeFileSync(m.file, original)
  }
  if (verdict === 'CAUGHT') { caught++; console.log(`  CAUGHT  ${m.name}  → "${m.expect}"`) }
  else { wrong++; console.log(`  ${verdict}  ${m.name}`) }
}

// restored, and green again
build()
stopPreview()
if (!await startPreview()) { console.log('\nFAIL — preview did not restart after restoring.'); process.exit(1) }
const after = runProbe()
console.log(`\nrestored: the probe ${after.ok ? 'PASSES' : 'FAILS'} on clean source again`)
stopPreview()
if (!after.ok) { console.log('FAIL — a mutation survived into the tree.'); process.exit(1) }

console.log(`\n${caught} caught, ${wrong} wrong, ${anchorFails} never anchored, of ${MUTATIONS.length} mutations`)
console.log('COVERAGE: the mount class and the aria summary. It does NOT mutate the')
console.log('tab-opening path or the >=2-sample guard — those have no single anchor.')
process.exit(wrong || anchorFails ? 1 : 0)
