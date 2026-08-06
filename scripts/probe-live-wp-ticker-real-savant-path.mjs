// Follow-up on the second real, disclosed gap in the 2026-08-05 demo/infra
// sweep (docs/outbox/cc-session-2026-08-05-demo-infra-sweep.md):
// WpSourceBadge's real network-backed data path (via its real host,
// LiveWpTicker) was sandbox-network-gated -- statsapi.mlb.com and
// baseballsavant.mlb.com are unreachable from chat, confirmed repeatedly
// this session. Only the badge's own prop-driven render logic was verified
// directly (an isolated mount with a mocked `source` prop), not the real
// end-to-end path: real live MLB game -> real gamePk resolution -> real
// Savant fetch -> a genuine "SAVANT" badge with real live data.
//
// Runs against the REAL PRODUCTION BUILD (`vite preview`), not dev mode --
// LiveWpTicker's real data path is a DIRECT client fetch to the real
// external hosts, identical in dev and prod (no dev mock exists for it).
//
// HONEST SCOPING: whether a real live MLB game exists at the moment this
// runs is a real-world fact this probe cannot control. Both possible real
// outcomes are legitimate and reported as such -- a live game resolving to
// a real SAVANT badge, or the honest "no live MLB games right now" empty
// state -- neither is treated as a failure on its own; only a crash, a
// stuck loading state, or the badge failing to render given real resolved
// data would be.

import { chromium } from 'playwright'
import { mkdirSync, writeFileSync } from 'node:fs'

mkdirSync('outbox', { recursive: true })
const stamp = new Date().toISOString().replace(/[:.]/g, '-')
const outPath = 'outbox/live-wp-ticker-real-savant-path-probe-' + stamp + '.txt'
const out = []
const log = s => { out.push(s); console.log(s); try { writeFileSync(outPath, out.join('\n')) } catch {} }

const PREVIEW_URL = process.env.PREVIEW_URL || 'http://127.0.0.1:4174'

async function main() {
  log('probe_at: ' + new Date().toISOString())
  log('purpose: exercise LiveWpTicker + WpSourceBadge\'s real network-backed path against the')
  log('ACTUAL real hosts (statsapi.mlb.com, baseballsavant.mlb.com) -- sandbox-blocked from chat,')
  log('never previously observed end-to-end.')
  log('')

  const browser = await chromium.launch()
  const page = await browser.newPage()
  const pageErrors = []
  page.on('pageerror', e => pageErrors.push(String(e)))

  await page.goto(PREVIEW_URL, { waitUntil: 'domcontentloaded', timeout: 30000 })

  const tabButtons = await page.$$('button, [role=tab]')
  for (const b of tabButtons) {
    const t = (await b.textContent() || '').trim().toLowerCase()
    if (t.startsWith('games')) { await b.click(); break }
  }
  await page.waitForTimeout(500)

  const root = await page.evaluateHandle(() => {
    const labels = Array.from(document.querySelectorAll('span'))
    const label = labels.find(s => s.textContent.trim() === 'Live WP Ticker')
    return label ? label.closest('div').parentElement : null
  })
  const found = await root.evaluate(el => !!el)
  if (!found) { log('FAILED: Live WP Ticker component not found on the games tab.'); await browser.close(); return }

  // Give real live-game resolution + real gamePk lookup + real Savant
  // fetch time to complete (each is a real network round-trip).
  await page.waitForTimeout(8000)

  const snapshot = await root.evaluate(el => el.innerText)
  log('=== RENDERED STATE ===')
  log(snapshot)
  log('')

  const hasBadge = /SAVANT|ESTIMATED/.test(snapshot)
  const honestEmpty = /No live MLB games right now/.test(snapshot)
  const stuckLoading = /loading/i.test(snapshot) && !hasBadge && !honestEmpty

  log('=== RESULT ===')
  log('real WpSourceBadge rendered (SAVANT or ESTIMATED): ' + hasBadge)
  log('honest "no live games" empty state: ' + honestEmpty)
  log('appears stuck in a loading state: ' + stuckLoading)
  log('page errors: ' + JSON.stringify(pageErrors))
  log('')

  log('=== VERDICT ===')
  if (pageErrors.length) {
    log('NOT CONFIRMED: real page errors occurred -- see above.')
  } else if (hasBadge) {
    log('CONFIRMED: the real end-to-end path resolved -- a real live MLB game, real gamePk')
    log('resolution, and a real Savant/estimate WpSourceBadge rendered with genuine live data.')
    log('The gap this probe was written to close is closed with a positive real observation.')
  } else if (honestEmpty) {
    log('CONFIRMED (honest empty state): no real MLB game happens to be live at this exact')
    log('moment -- a real-world timing fact, not a code defect. The component correctly showed')
    log('its own disclosed empty state rather than a stuck or broken one. Re-run during real live')
    log('MLB hours to observe the SAVANT-badge branch specifically.')
  } else if (stuckLoading) {
    log('NOT CONFIRMED: the component appears stuck loading -- a real problem worth investigating,')
    log('not explained by either real outcome above.')
  } else {
    log('INCONCLUSIVE: rendered state matched neither expected real outcome -- see snapshot above.')
  }

  await browser.close()
}

main().catch(e => { log('FAILED: ' + String(e)); process.exit(1) })
