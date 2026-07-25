// Isolated, instrumented check for a specific hypothesis: does the
// BroadcastChannel date-sync between two pages create an echo loop?
//
// 2026-07-25: two prior runs hung to the JOB's own timeout ceiling --
// fixed via a step-level timeout instead (see the workflow file). With
// that fixed, got a real, reproducible error twice in a row: page1's
// OWN initial load never rendered any gameRow within 15s -- before any
// second page or BroadcastChannel activity at all. Not the hypothesis
// under test; something more basic. Two changes this pass: (1) route
// registration here used Promise.all (concurrent) -- the proven-working
// main harness registers routes sequentially (one `await` at a time).
// Matched that instead of leaving it as an unexplained difference from
// the only pattern actually confirmed reliable. (2) Added direct
// console/pageerror listeners so if this fails again, the manifest
// shows the actual browser-side error, not just "timed out."

import { spawn } from 'node:child_process'
import { mkdirSync, writeFileSync, existsSync } from 'node:fs'
import { chromium } from 'playwright'

const SERVE_PORT = 4175
const SERVE_URL = `http://localhost:${SERVE_PORT}`

mkdirSync('outbox', { recursive: true })
const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
const checkpointPath = `outbox/broadcast-isolated-checkpoints-${timestamp}.json`
const checkpoints = []

function checkpoint(name, extra = {}) {
  checkpoints.push({ name, t: Date.now(), ...extra })
  try {
    writeFileSync(checkpointPath, JSON.stringify(checkpoints, null, 2))
  } catch { /* best effort */ }
}

checkpoint('script_started')

const manifest = { timestamp, checks: [] }

function sh(cmd, args) {
  return spawn(cmd, args, { stdio: 'pipe' })
}

async function waitForServer(url, timeoutMs = 15000) {
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(url)
      if (res.ok) return true
    } catch { /* not up yet */ }
    await new Promise(r => setTimeout(r, 300))
  }
  throw new Error(`static server did not come up within ${timeoutMs}ms`)
}

// Sequential now, matching the main harness exactly -- was Promise.all.
async function mockRoutes(page, counter) {
  await page.route('**/context/date/**', route => {
    counter.count++
    const url = route.request().url()
    const match = url.match(/\/context\/date\/([^/?]+)/)
    const date = match ? match[1] : 'unknown'
    counter.dates.push(date)
    route.fulfill({ json: { ok: true, date, games: { regular: [], postseason: [] }, briefs: [], series: [], standings: [] } })
  })
  await page.route('**/analytics/newspaper/**', route => route.fulfill({
    json: { ok: true, date: '2026-07-25', recap_date: '2026-07-24', generated_at: '', morning_report: '', pick: { ranked: [] } },
  }))
  await page.route('**/wc/standings**', route => route.fulfill({ json: { groups: {} } }))
  await page.route('**/mlb-stats/standings**', route => route.fulfill({ json: { records: [] } }))
  await page.route('**/mls/stats/**', route => route.fulfill({ json: { tables: [{ entries: [] }] } }))
}

function attachDiagnostics(page, label, counter) {
  counter.consoleErrors = []
  counter.pageErrors = []
  page.on('console', msg => {
    if (msg.type() === 'error') counter.consoleErrors.push(msg.text())
  })
  page.on('pageerror', err => {
    counter.pageErrors.push(String(err))
  })
}

async function main() {
  checkpoint('checking_dist_exists')
  if (!existsSync('dist/index.html')) {
    checkpoint('FATAL_dist_missing')
    throw new Error('dist/index.html not found -- npm run build must run first')
  }

  const server = sh('python3', ['-m', 'http.server', String(SERVE_PORT), '--directory', 'dist'])
  checkpoint('static_server_spawned', { pid: server.pid })

  try {
    await waitForServer(SERVE_URL)
    checkpoint('static_server_responding')

    const browser = await chromium.launch()
    checkpoint('browser_launched')
    const context = await browser.newContext()
    checkpoint('context_created')

    const counter1 = { count: 0, dates: [] }
    const counter2 = { count: 0, dates: [] }

    const page1 = await context.newPage()
    checkpoint('page1_created')
    attachDiagnostics(page1, 'page1', counter1)
    await mockRoutes(page1, counter1)
    checkpoint('page1_routes_registered')
    await page1.goto(SERVE_URL, { timeout: 15000 })
    checkpoint('page1_navigated')
    try {
      await page1.waitForSelector('[class*="dateBrowser"]', { timeout: 15000 })
      checkpoint('page1_settled')
    } catch (e) {
      checkpoint('page1_render_timeout', {
        consoleErrors: counter1.consoleErrors,
        pageErrors: counter1.pageErrors,
        bodyText: await page1.evaluate(() => document.body.innerText.slice(0, 500)).catch(() => 'EVAL_FAILED'),
      })
      throw e
    }

    const page2 = await context.newPage()
    checkpoint('page2_created')
    attachDiagnostics(page2, 'page2', counter2)
    await mockRoutes(page2, counter2)
    checkpoint('page2_routes_registered')
    await page2.goto(SERVE_URL, { timeout: 15000 })
    checkpoint('page2_navigated')
    await page2.waitForSelector('[class*="dateBrowser"]', { timeout: 15000 })
    checkpoint('page2_settled')

    await new Promise(r => setTimeout(r, 1000))
    const baseline1 = counter1.count
    const baseline2 = counter2.count
    manifest.baselineCounts = { page1: baseline1, page2: baseline2 }
    checkpoint('baseline_captured', { baseline1, baseline2 })

    await page2.click('[class*="dateBtn"]:last-of-type')
    checkpoint('page2_date_button_clicked')

    const samples = []
    for (let i = 0; i < 8; i++) {
      await new Promise(r => setTimeout(r, 500))
      const sample = { tMs: (i + 1) * 500, page1Count: counter1.count, page2Count: counter2.count }
      samples.push(sample)
      checkpoint(`sample_${i}`, sample)
    }
    manifest.samples = samples

    await browser.close()
    checkpoint('browser_closed')

    const finalPage1 = samples[samples.length - 1].page1Count
    const finalPage2 = samples[samples.length - 1].page2Count
    const stabilized = samples[samples.length - 1].page1Count === samples[samples.length - 2].page1Count &&
      samples[samples.length - 1].page2Count === samples[samples.length - 2].page2Count
    const totalNewFetches = (finalPage1 - baseline1) + (finalPage2 - baseline2)

    manifest.checks.push({
      name: 'fetch_counts_stabilized_not_runaway',
      pass: stabilized && totalNewFetches <= 4,
      finalPage1, finalPage2, baseline1, baseline2, totalNewFetches, stabilized,
    })

    manifest.allPass = manifest.checks.every(c => c.pass)
    checkpoint('manifest_complete', { allPass: manifest.allPass })
    console.log(`Result: ${manifest.allPass ? 'ALL PASS ✓' : 'FAILURES DETECTED ✗'}`)
    console.log(JSON.stringify(manifest, null, 2))
    writeFileSync(`outbox/broadcast-isolated-manifest-${timestamp}.json`, JSON.stringify(manifest, null, 2))
    if (!manifest.allPass) process.exitCode = 1
  } catch (err) {
    checkpoint('CAUGHT_ERROR', { error: String(err), stack: err?.stack })
    manifest.error = String(err)
    writeFileSync(`outbox/broadcast-isolated-manifest-${timestamp}.json`, JSON.stringify(manifest, null, 2))
    console.error('FAILED:', err)
    process.exitCode = 1
  } finally {
    server.kill()
    checkpoint('script_ending')
  }
}

process.on('uncaughtException', e => {
  checkpoint('UNCAUGHT_EXCEPTION', { error: String(e), stack: e?.stack })
  process.exit(1)
})
process.on('unhandledRejection', e => {
  checkpoint('UNHANDLED_REJECTION', { error: String(e) })
  process.exit(1)
})

main()
