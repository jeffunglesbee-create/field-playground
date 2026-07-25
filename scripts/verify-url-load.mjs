// Isolated check: does loading the app with ?d=YYYY-MM-DD in the URL
// correctly seed currentDate to that date (initialDateFromUrl in
// relay.js), rather than defaulting to today?
//
// Split out from scripts/verify-reconciliation.mjs deliberately -- that
// script's combined run hit an 8-minute job-timeout cancellation right
// after this check was added (a mid-script full page.goto() reload was
// the likely cause), with zero checkpoint data recovered since GHA kills
// the whole job on a hard timeout, including the commit-back step.
// Smaller, isolated scripts fail more informatively than one large one.

import { spawn } from 'node:child_process'
import { mkdirSync, writeFileSync, existsSync } from 'node:fs'
import { chromium } from 'playwright'

const SERVE_PORT = 4174
const RELOAD_TARGET_DATE = '2026-08-01'

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

async function main() {
  if (!existsSync('dist/index.html')) {
    throw new Error('dist/index.html not found -- npm run build must run first')
  }

  const server = sh('python3', ['-m', 'http.server', String(SERVE_PORT), '--directory', 'dist'])
  try {
    await waitForServer(`http://localhost:${SERVE_PORT}`)

    const browser = await chromium.launch()
    const page = await browser.newPage()

    let requestedDate = null
    await page.route('**/context/date/**', route => {
      const url = route.request().url()
      const match = url.match(/\/context\/date\/([^/?]+)/)
      requestedDate = match ? match[1] : 'unknown'
      route.fulfill({
        json: {
          ok: true, date: requestedDate,
          games: { regular: [], postseason: [] },
          briefs: [], series: [], standings: [],
        },
      })
    })
    await page.route('**/analytics/newspaper/**', route => route.fulfill({
      json: { ok: true, date: requestedDate || RELOAD_TARGET_DATE, recap_date: '2026-07-31', generated_at: '', morning_report: '', pick: { ranked: [] } },
    }))
    await page.route('**/wc/standings**', route => route.fulfill({ json: { groups: {} } }))
    await page.route('**/mlb-stats/standings**', route => route.fulfill({ json: { records: [] } }))
    await page.route('**/mls/stats/**', route => route.fulfill({ json: { tables: [{ entries: [] }] } }))

    // The actual check: navigate DIRECTLY to a URL with ?d= already set,
    // as if opening a shared link -- not a mid-session reload.
    await page.goto(`http://localhost:${SERVE_PORT}/?d=${RELOAD_TARGET_DATE}`, { timeout: 15000 })
    await page.waitForTimeout(1500)

    manifest.requestedDate = requestedDate
    manifest.expectedDate = RELOAD_TARGET_DATE
    manifest.checks.push({
      name: 'url_date_param_used_on_initial_load',
      pass: requestedDate === RELOAD_TARGET_DATE,
      requestedDate, expectedDate: RELOAD_TARGET_DATE,
    })

    await browser.close()

    manifest.allPass = manifest.checks.every(c => c.pass)
    console.log(`Result: ${manifest.allPass ? 'ALL PASS ✓' : 'FAILURES DETECTED ✗'}`)
    console.log(JSON.stringify(manifest, null, 2))
    writeFileSync(`outbox/url-load-check-manifest-${timestamp}.json`, JSON.stringify(manifest, null, 2))
    if (!manifest.allPass) process.exitCode = 1
  } catch (err) {
    manifest.error = String(err)
    writeFileSync(`outbox/url-load-check-manifest-${timestamp}.json`, JSON.stringify(manifest, null, 2))
    console.error('FAILED:', err)
    process.exitCode = 1
  } finally {
    server.kill()
  }
}

main()
