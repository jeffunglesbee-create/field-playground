// Isolated, instrumented check for a specific hypothesis: does the
// BroadcastChannel date-sync between two pages create an echo loop?
// Each page's initBroadcastDateSync() re-posts to the channel whenever
// currentDate changes -- including changes that arrived FROM the
// channel. The guard (incoming !== currentDate()) should prevent a
// bounce-back, but if there's any timing gap between the signal write
// and that comparison, two pages could ping-pong a date change forever
// -- and since currentDate also drives data-fetching, each bounce would
// trigger new fetches on both pages. That would explain an open-ended
// hang exactly the length seen in the combined harness (two runs,
// 8-minute job ceiling, no error, no checkpoint data).
//
// Deliberately short job timeout (this workflow's, not this script's) --
// if this hypothesis is right, a runaway loop shows up in seconds, not
// minutes. No reason to wait out a long ceiling to find out.

import { spawn } from 'node:child_process'
import { mkdirSync, writeFileSync, existsSync } from 'node:fs'
import { chromium } from 'playwright'

const SERVE_PORT = 4175
const SERVE_URL = `http://localhost:${SERVE_PORT}`

mkdirSync('outbox', { recursive: true })
const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
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

function mockRoutes(page, counter) {
  return Promise.all([
    page.route('**/context/date/**', route => {
      counter.count++
      const url = route.request().url()
      const match = url.match(/\/context\/date\/([^/?]+)/)
      const date = match ? match[1] : 'unknown'
      counter.dates.push(date)
      route.fulfill({ json: { ok: true, date, games: { regular: [], postseason: [] }, briefs: [], series: [], standings: [] } })
    }),
    page.route('**/analytics/newspaper/**', route => route.fulfill({
      json: { ok: true, date: '2026-07-25', recap_date: '2026-07-24', generated_at: '', morning_report: '', pick: { ranked: [] } },
    })),
    page.route('**/wc/standings**', route => route.fulfill({ json: { groups: {} } })),
    page.route('**/mlb-stats/standings**', route => route.fulfill({ json: { records: [] } })),
    page.route('**/mls/stats/**', route => route.fulfill({ json: { tables: [{ entries: [] }] } })),
  ])
}

async function main() {
  if (!existsSync('dist/index.html')) throw new Error('dist/index.html not found -- npm run build must run first')

  const server = sh('python3', ['-m', 'http.server', String(SERVE_PORT), '--directory', 'dist'])
  try {
    await waitForServer(SERVE_URL)

    const browser = await chromium.launch()
    const context = await browser.newContext()

    const counter1 = { count: 0, dates: [] }
    const counter2 = { count: 0, dates: [] }

    const page1 = await context.newPage()
    await mockRoutes(page1, counter1)
    await page1.goto(SERVE_URL, { timeout: 15000 })
    await page1.waitForSelector('[class*="gameRow"]', { timeout: 15000 })

    const page2 = await context.newPage()
    await mockRoutes(page2, counter2)
    await page2.goto(SERVE_URL, { timeout: 15000 })
    await page2.waitForSelector('[class*="gameRow"]', { timeout: 15000 })

    // Snapshot fetch counts after both pages have settled from initial
    // load, before touching anything -- this is the real baseline.
    await new Promise(r => setTimeout(r, 1000))
    const baseline1 = counter1.count
    const baseline2 = counter2.count
    manifest.baselineCounts = { page1: baseline1, page2: baseline2 }

    // Trigger ONE date change on page2, then watch fetch counts over a
    // short, bounded window. A single change should produce at most ONE
    // additional fetch per page (page2's own click, page1's one
    // echo-guarded follow). A runaway loop would show counts climbing
    // continuously instead of settling.
    await page2.click('[class*="dateBtn"]:last-of-type')

    const samples = []
    for (let i = 0; i < 8; i++) {
      await new Promise(r => setTimeout(r, 500))
      samples.push({ tMs: (i + 1) * 500, page1Count: counter1.count, page2Count: counter2.count })
    }
    manifest.samples = samples

    await browser.close()

    const finalPage1 = samples[samples.length - 1].page1Count
    const finalPage2 = samples[samples.length - 1].page2Count
    const stabilized = samples[samples.length - 1].page1Count === samples[samples.length - 2].page1Count &&
      samples[samples.length - 1].page2Count === samples[samples.length - 2].page2Count
    const totalNewFetches = (finalPage1 - baseline1) + (finalPage2 - baseline2)

    manifest.checks.push({
      name: 'fetch_counts_stabilized_not_runaway',
      pass: stabilized && totalNewFetches <= 4, // generous ceiling -- 1-2 expected, not dozens
      finalPage1, finalPage2, baseline1, baseline2, totalNewFetches, stabilized,
    })

    manifest.allPass = manifest.checks.every(c => c.pass)
    console.log(`Result: ${manifest.allPass ? 'ALL PASS ✓' : 'FAILURES DETECTED ✗'}`)
    console.log(JSON.stringify(manifest, null, 2))
    writeFileSync(`outbox/broadcast-isolated-manifest-${timestamp}.json`, JSON.stringify(manifest, null, 2))
    if (!manifest.allPass) process.exitCode = 1
  } catch (err) {
    manifest.error = String(err)
    writeFileSync(`outbox/broadcast-isolated-manifest-${timestamp}.json`, JSON.stringify(manifest, null, 2))
    console.error('FAILED:', err)
    process.exitCode = 1
  } finally {
    server.kill()
  }
}

main()
