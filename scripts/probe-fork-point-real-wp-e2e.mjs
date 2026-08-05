// End-to-end confirmation that Fork Point's real-WP toggle works against
// the ACTUAL real hosts (statsapi.mlb.com, baseballsavant.mlb.com) from a
// real browser, not the mocked local Playwright run used to verify the
// component's own parsing/rendering logic (both sandbox-blocked from
// chat, same as every prior probe this session). Drives the real built
// app, toggles real WP on for the real default source/fork pairing, and
// records whichever HONEST outcome occurs -- a real WP verdict, or the
// real "unavailable" message -- since docs/outbox/cc-session-2026-08-05-
// fork-point-savant-historical-coverage-probe.md already found 13/13
// coverage but never claimed 100% guaranteed forever.

import { chromium } from 'playwright'
import { mkdirSync, writeFileSync } from 'node:fs'

mkdirSync('outbox', { recursive: true })
const stamp = new Date().toISOString().replace(/[:.]/g, '-')
const outPath = 'outbox/fork-point-real-wp-e2e-probe-' + stamp + '.txt'
const out = []
const log = s => { out.push(s); console.log(s); try { writeFileSync(outPath, out.join('\n')) } catch {} }

const PREVIEW_URL = process.env.PREVIEW_URL || 'http://127.0.0.1:4173'

async function main() {
  log('probe_at: ' + new Date().toISOString())
  log('purpose: does the real-WP toggle work end-to-end against the ACTUAL real hosts,')
  log('in a real built app, real browser -- not mocked?')
  log('')

  const browser = await chromium.launch()
  const page = await browser.newPage()
  const pageErrors = []
  page.on('pageerror', e => pageErrors.push(String(e)))

  // This app polls continuously in the background (health checks, live
  // tickers), so 'networkidle' never resolves against the real built
  // app -- 'domcontentloaded' + explicit waitForFunction below is the
  // pattern this repo's own other CI probes already use for exactly
  // this reason (e.g. scripts/probe-broadcast-call-tts.mjs).
  await page.goto(PREVIEW_URL, { waitUntil: 'domcontentloaded', timeout: 30000 })

  const tabButtons = await page.$$('button, [role=tab]')
  for (const b of tabButtons) {
    const t = (await b.textContent() || '').trim().toLowerCase()
    if (t.startsWith('lab')) { await b.click(); break }
  }
  await page.waitForTimeout(500)

  await page.waitForFunction(() => {
    const labels = Array.from(document.querySelectorAll('span'))
    const label = labels.find(s => s.textContent.trim() === 'Fork Point')
    return label && label.closest('div').parentElement.textContent.includes('Biggest real forks')
  }, { timeout: 20000 })
  log('Fork Point real candidate data loaded.')

  const forkRoot = await page.evaluateHandle(() => {
    const labels = Array.from(document.querySelectorAll('span'))
    const label = labels.find(s => s.textContent.trim() === 'Fork Point')
    return label.closest('div').parentElement
  })

  const checkbox = await forkRoot.evaluateHandle(root => root.querySelector('input[type=checkbox]'))
  await checkbox.evaluate(el => el.click())
  log('Real WP toggle clicked on for the real default source/fork pairing.')

  await page.waitForFunction(() => {
    const labels = Array.from(document.querySelectorAll('span'))
    const label = labels.find(s => s.textContent.trim() === 'Fork Point')
    const text = label.closest('div').parentElement.textContent
    return !text.includes('Fetching real win probability')
  }, { timeout: 20000 })

  const snapshot = await forkRoot.evaluate(root => root.innerText)
  log('')
  log('=== RENDERED STATE ===')
  log(snapshot)
  log('')

  const gotRealWp = snapshot.includes("real win probability") && snapshot.includes('Baseball Savant')
  const gotHonestUnavailable = snapshot.includes('unavailable for')

  log('=== RESULT ===')
  log('real WP verdict rendered: ' + gotRealWp)
  log('honest unavailable message rendered: ' + gotHonestUnavailable)
  log('page errors: ' + JSON.stringify(pageErrors))
  log('')

  log('=== VERDICT ===')
  if (pageErrors.length) {
    log('NOT CONFIRMED: real page errors occurred -- see above.')
  } else if (gotRealWp || gotHonestUnavailable) {
    log('CONFIRMED: real-WP toggle behaves honestly end-to-end against the real hosts -- either')
    log('real Savant data rendered, or a disclosed unavailable message did, never a silent blank state.')
  } else {
    log('NOT CONFIRMED: neither a real WP verdict nor an honest unavailable message appeared.')
  }

  await browser.close()
}

main().catch(e => { log('FAILED: ' + String(e)); process.exit(1) })
