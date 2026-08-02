// Runs the exact diagnostic specified in jubilant-bassoon's own
// CC-CMD-2026-08-02-bracketdo-probe-diagnostics.md, directly, now --
// this is a read-only observation of the live production site's real
// behavior (why does wcMode read false right after toggleWCView() is
// called), not a change to production code, so it doesn't need to
// wait for a CC-CMD pickup cycle. The actual fix in field.js is
// already confirmed correct; this exists only to answer why the test
// harness couldn't observe it working.

import { chromium } from 'playwright'
import { mkdirSync, writeFileSync } from 'node:fs'

mkdirSync('outbox', { recursive: true })
const stamp = new Date().toISOString().replace(/[:.]/g, '-')
const outPath = 'outbox/bracketdo-diagnostic-' + stamp + '.txt'
const out = []
const log = s => {
  out.push(s); console.log(s)
  try { writeFileSync(outPath, out.join('\n')) } catch {}
}

const FIELD_URL = 'https://jubilant-bassoon.jeffunglesbee.workers.dev?wpt'

async function main() {
  log('probe_at: ' + new Date().toISOString())
  log('purpose: why does wcMode read false right after toggleWCView() is called, against the real live site')
  log('')

  const browser = await chromium.launch()
  const page = await browser.newPage()
  const consoleErrors = []
  page.on('console', m => { if (m.type() === 'error') consoleErrors.push(m.text()) })

  log('=== NAVIGATING to real live site ===')
  await page.goto(FIELD_URL, { waitUntil: 'domcontentloaded', timeout: 20000 })

  const bootReady = await page.waitForFunction(() => !!window._fieldDataReady, { timeout: 20000 })
    .then(() => true).catch(() => false)
  log('bootReady (waited for window._fieldDataReady): ' + bootReady)

  const bracketReady = await page.waitForFunction(
    () => typeof window.toggleWCView === 'function' && !!window._bracketWS,
    { timeout: 15000 }
  ).then(() => true).catch(() => false)
  log('bracketReady (waited for toggleWCView + _bracketWS): ' + bracketReady)

  const diag = await page.evaluate(() => ({
    toggleWCViewType: typeof window.toggleWCView,
    bracketWSExists: !!window._bracketWS,
    fieldDataReady: !!window._fieldDataReady,
    wcNavLinkExists: !!document.getElementById('wc-nav-link'),
    wcSectionExists: !!document.getElementById('wc-section'),
    bodyClassList: document.body.className,
    readyState: document.readyState,
  }))
  log('')
  log('=== DIAGNOSTIC (pre-toggle state) ===')
  log(JSON.stringify(diag, null, 2))

  // Now actually call it and see what happens, with a try/catch this
  // time so a genuine exception is visible rather than silently
  // crashing the whole script the way the original probe's unguarded
  // call would have.
  log('')
  log('=== ATTEMPTING toggleWCView() with explicit error capture ===')
  const toggleResult = await page.evaluate(() => {
    try {
      const before = document.body.classList.contains('wc-mode')
      const ret = window.toggleWCView()
      const after = document.body.classList.contains('wc-mode')
      return { ok: true, before, ret, after }
    } catch (e) {
      return { ok: false, error: String(e), stack: e?.stack }
    }
  })
  log(JSON.stringify(toggleResult, null, 2))

  // THE REAL REMAINING QUESTION: the toggle itself just worked
  // correctly above. The original stalled probe waited 1.5s after
  // this exact point before checking state again -- and a real 403
  // showed up in that run's console errors. toggleWCView() triggers
  // renderWCSection(), which fires 4 parallel data fetches
  // (standings/results/odds/live-games). If wc-mode gets reset
  // between now and 1.5s from now, something in that async chain is
  // the real cause, not the toggle or the guard.
  log('')
  log('=== WAITING 1.5s (matching the original probe\'s exact timing) THEN RE-CHECKING ===')
  await page.waitForTimeout(1500)
  const afterWait = await page.evaluate(() => ({
    wcMode: document.body.classList.contains('wc-mode'),
    bodyClassList: document.body.className,
    liveIndicator: document.getElementById('wc-tab-bracket-btn')?.classList.contains('bracket-live') || false,
  }))
  log(JSON.stringify(afterWait, null, 2))
  if (!afterWait.wcMode) {
    log('')
    log('CONFIRMED: wc-mode was present immediately after toggle, but is GONE 1.5s later. Something in that window resets it -- likely renderWCSection()\'s own async chain, not the toggle or the visibilitychange guard.')
  } else {
    log('')
    log('wc-mode persisted through the wait -- the original stalled probe\'s failure was not this specific reset. Real cause remains elsewhere.')
  }

  log('')
  log('=== console errors captured ===')
  log('count: ' + consoleErrors.length)
  for (const e of consoleErrors.slice(0, 15)) log('  ' + e.slice(0, 300))

  await browser.close()
  log('')
  log('=== DONE ===')
}

main().catch(e => { log('SCRIPT FAILED: ' + String(e)); process.exit(1) })
