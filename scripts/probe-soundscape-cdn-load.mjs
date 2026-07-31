// The artifact-check harness runs OFFLINE (all fetches aborted) by
// design, to test adverse conditions -- confirmed elsewhere this
// session as the right default. But DramaSoundscape's CDN import only
// fires on an explicit user click ("tap to enable sound"), which the
// offline harness never simulates. So a clean artifact-check result
// proves the component's INITIAL state renders without crashing --
// it does NOT prove the CDN import itself actually works. That's a
// real gap, not a technicality, and it's exactly the kind of claim
// this project has repeatedly caught going unverified elsewhere.
//
// This script closes that gap: real browser, real network (NOT
// offline this time -- the CDN import needs to genuinely succeed),
// clicks the actual enable button, and checks for the real result.

import { chromium } from 'playwright'
import { mkdirSync, writeFileSync } from 'node:fs'

mkdirSync('outbox', { recursive: true })
const stamp = new Date().toISOString().replace(/[:.]/g, '-')
const outPath = 'outbox/soundscape-cdn-load-probe-' + stamp + '.txt'
const out = []
const log = s => { out.push(s); console.log(s); try { writeFileSync(outPath, out.join('\n')) } catch {} }

async function main() {
  log('probe_at: ' + new Date().toISOString())
  log('purpose: does DramaSoundscape\'s CDN Tone.js import genuinely succeed on a real click, in a real (non-offline) browser?')
  log('')

  const browser = await chromium.launch()
  const page = await browser.newPage()

  const consoleErrors = []
  page.on('console', msg => { if (msg.type() === 'error') consoleErrors.push(msg.text()) })
  page.on('pageerror', err => consoleErrors.push('pageerror: ' + err.message))

  // Real network this run -- deliberately NOT offline, since the whole
  // point is proving the CDN fetch actually completes.
  await page.goto('https://field-playground.jeffunglesbee.workers.dev/', { waitUntil: 'networkidle' })

  // Navigate to the Games tab where DramaSoundscape lives.
  const gamesTab = page.locator('button', { hasText: 'Games' }).first()
  if (await gamesTab.count()) await gamesTab.click()
  await page.waitForTimeout(500)

  const enableBtn = page.locator('button', { hasText: 'tap to enable sound' })
  const found = await enableBtn.count()
  log('enable button found: ' + found)

  if (!found) {
    log('FAILED: could not find the enable-sound button at all -- component may not have rendered')
    await browser.close()
    return
  }

  await enableBtn.click()
  log('clicked enable button, waiting for CDN import + Tone.start()...')

  // Give the CDN fetch + Tone.js init genuine time -- this is a real
  // network round-trip, not instant.
  await page.waitForTimeout(4000)

  const onBadge = page.locator('text=sound on')
  const errorText = page.locator('text=/Couldn\'t load/')
  const stillLoading = page.locator('button', { hasText: 'loading' })

  const onCount = await onBadge.count()
  const errCount = await errorText.count()
  const loadingCount = await stillLoading.count()

  log('')
  log('=== RESULT ===')
  log('"sound on" badge present: ' + (onCount > 0))
  log('error message present: ' + (errCount > 0))
  if (errCount > 0) {
    log('error text: ' + (await errorText.first().textContent()))
  }
  log('still stuck loading after 4s: ' + (loadingCount > 0))
  log('')
  log('console/page errors captured: ' + consoleErrors.length)
  for (const e of consoleErrors.slice(0, 10)) log('  ' + e.slice(0, 200))

  log('')
  log('=== VERDICT ===')
  if (onCount > 0 && errCount === 0) {
    log('CONFIRMED: the CDN import genuinely succeeds in a real browser. Tone.js loaded, Tone.start() completed, the component reached its enabled state for real -- not assumed.')
  } else if (errCount > 0) {
    log('CONFIRMED FAILURE: the CDN import does not work as built. Real error captured above -- this needs a fix (different CDN host, or falling back to bundling Tone.js properly), not a retry.')
  } else {
    log('INCONCLUSIVE: neither the success state nor an error message appeared within the wait window. May need a longer timeout, or something is failing silently -- check the console errors above.')
  }

  await browser.close()
}

main().catch(e => { log('SCRIPT FAILED: ' + String(e)); process.exit(1) })
