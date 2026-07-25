// Verifies initOutcomesSync() -- the one item Claude Code's own outbox
// entry explicitly flagged as built-but-not-manually-verified. Real
// question: does a tab-external write to outcomes() (an OBJECT signal,
// not the string signal date-sync already proved) correctly propagate
// through THREE separate derived memos in History
// (useTierCalibration, useMultiDayRecord, usePickCalendar), or does
// only the raw signal update while the memos stay stale.
//
// Same proven pattern as verify-broadcast-isolated.mjs: two real pages
// in one browser context, short step-level timeout, checkpoint logging
// so a failure leaves evidence.

import { spawn } from 'node:child_process'
import { mkdirSync, writeFileSync, existsSync } from 'node:fs'
import { chromium } from 'playwright'

const SERVE_PORT = 4176
const SERVE_URL = `http://localhost:${SERVE_PORT}`

mkdirSync('outbox', { recursive: true })
const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
const checkpointPath = `outbox/outcomes-sync-checkpoints-${timestamp}.json`
const checkpoints = []
function checkpoint(name, extra = {}) {
  checkpoints.push({ name, t: Date.now(), ...extra })
  try { writeFileSync(checkpointPath, JSON.stringify(checkpoints, null, 2)) } catch {}
}
checkpoint('script_started')

const manifest = { timestamp, checks: [] }

function sh(cmd, args) { return spawn(cmd, args, { stdio: 'pipe' }) }

async function waitForServer(url, timeoutMs = 15000) {
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    try { const res = await fetch(url); if (res.ok) return true } catch {}
    await new Promise(r => setTimeout(r, 300))
  }
  throw new Error(`static server did not come up within ${timeoutMs}ms`)
}

async function mockRoutes(page) {
  await page.route('**/context/date/**', route => route.fulfill({
    json: {
      ok: true, date: '2026-07-25',
      games: {
        regular: [{
          id: '2026-07-25-mlb-nym-phi', sport: 'MLB', home: 'Philadelphia Phillies', away: 'NY Mets',
          home_score: 4, away_score: 2, venue: 'Citizens Bank Park',
          finalized_at: '2026-07-25T02:15:00Z', went_to_ot: null,
        }],
        postseason: [],
      },
      briefs: [], series: [], standings: [],
    },
  }))
  await page.route('**/analytics/newspaper/**', route => route.fulfill({
    json: {
      ok: true, date: '2026-07-25', recap_date: '2026-07-24', generated_at: '', morning_report: '',
      pick: { ranked: [{ game_id: '2026-07-25-mlb-nym-phi', sport: 'mlb', home: 'Philadelphia Phillies', away: 'NY Mets', score: 1, tier: 2, reasons: [] }] },
    },
  }))
  await page.route('**/wc/standings**', route => route.fulfill({ json: { groups: {} } }))
  await page.route('**/mlb-stats/standings**', route => route.fulfill({ json: { records: [] } }))
  await page.route('**/mls/stats/**', route => route.fulfill({ json: { tables: [{ entries: [] }] } }))
}

async function main() {
  checkpoint('checking_dist_exists')
  if (!existsSync('dist/index.html')) throw new Error('dist/index.html not found -- npm run build must run first')

  const server = sh('python3', ['-m', 'http.server', String(SERVE_PORT), '--directory', 'dist'])
  checkpoint('static_server_spawned', { pid: server.pid })

  try {
    await waitForServer(SERVE_URL)
    checkpoint('static_server_responding')

    const browser = await chromium.launch()
    checkpoint('browser_launched')
    const context = await browser.newContext()

    const page1 = await context.newPage()
    await mockRoutes(page1)
    await page1.goto(SERVE_URL, { timeout: 15000 })
    await page1.waitForSelector('[class*="dateBrowser"]', { timeout: 15000 })
    checkpoint('page1_settled')

    const page2 = await context.newPage()
    await mockRoutes(page2)
    await page2.goto(SERVE_URL, { timeout: 15000 })
    await page2.waitForSelector('[class*="dateBrowser"]', { timeout: 15000 })
    checkpoint('page2_settled')

    // Mark the outcome as W on page1's AmbientPanel pick, tier included.
    const outcomeBtnClicked = await page1.evaluate(() => {
      const buttons = Array.from(document.querySelectorAll('[class*="outcomeBtn"]'))
      const wBtn = buttons.find(b => b.textContent.trim() === 'W')
      if (wBtn) { wBtn.click(); return true }
      return false
    })
    manifest.outcomeBtnClicked = outcomeBtnClicked
    checkpoint('outcome_marked_on_page1', { outcomeBtnClicked })

    await page1.waitForTimeout(1500) // let the batched writes + broadcast settle

    // page2's History (multi-day record + calendar) should reflect the
    // mark WITHOUT any interaction on page2 at all -- read the running
    // total text, which useMultiDayRecord derives fresh from outcomes().
    const page2RunningTotal = await page2.evaluate(() => {
      const el = document.querySelector('[class*="runningTotal"]')
      return el ? el.textContent.trim() : null
    })
    manifest.page2RunningTotal = page2RunningTotal
    checkpoint('page2_history_checked', { page2RunningTotal })

    await page1.screenshot({ path: `outbox/outcomes-sync-page1-${timestamp}.png` })
    await page2.screenshot({ path: `outbox/outcomes-sync-page2-${timestamp}.png` })

    await browser.close()
    checkpoint('browser_closed')

    manifest.checks.push({
      name: 'outcome_marked_successfully_on_page1',
      pass: !!outcomeBtnClicked,
    })
    manifest.checks.push({
      name: 'page2_history_reflects_cross_tab_outcome',
      pass: !!page2RunningTotal && page2RunningTotal.includes('1-0-0'),
      page2RunningTotal,
    })

    manifest.allPass = manifest.checks.every(c => c.pass)
    checkpoint('manifest_complete', { allPass: manifest.allPass })
    console.log(`Result: ${manifest.allPass ? 'ALL PASS ✓' : 'FAILURES DETECTED ✗'}`)
    console.log(JSON.stringify(manifest, null, 2))
    writeFileSync(`outbox/outcomes-sync-manifest-${timestamp}.json`, JSON.stringify(manifest, null, 2))
    if (!manifest.allPass) process.exitCode = 1
  } catch (err) {
    checkpoint('CAUGHT_ERROR', { error: String(err), stack: err?.stack })
    manifest.error = String(err)
    writeFileSync(`outbox/outcomes-sync-manifest-${timestamp}.json`, JSON.stringify(manifest, null, 2))
    console.error('FAILED:', err)
    process.exitCode = 1
  } finally {
    server.kill()
    checkpoint('script_ending')
  }
}

process.on('uncaughtException', e => { checkpoint('UNCAUGHT_EXCEPTION', { error: String(e) }); process.exit(1) })
process.on('unhandledRejection', e => { checkpoint('UNHANDLED_REJECTION', { error: String(e) }); process.exit(1) })

main()
