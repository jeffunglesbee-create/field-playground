// Closes the first of the two gaps behind the real-WP feature's 92/100
// confidence gate (docs/outbox/cc-session-2026-08-05-fork-point-real-wp-
// splicing.md): the first e2e probe only ever exercised ONE real
// source/fork pairing (the default) end-to-end against the real hosts.
// This sweeps several distinct real pairings -- manual selections
// spread across the real candidate pool, plus a couple of the app's own
// "Biggest real forks" ranked picks -- through the real WP toggle
// against the ACTUAL real hosts (statsapi.mlb.com,
// baseballsavant.mlb.com), confirming each renders honestly: either
// real Savant data, or the disclosed "unavailable" message. Never a
// silent gap.
//
// Both hosts are sandbox-blocked from chat -- CI-as-proxy, same pattern
// as every prior probe this session.

import { chromium } from 'playwright'
import { mkdirSync, writeFileSync } from 'node:fs'

mkdirSync('outbox', { recursive: true })
const stamp = new Date().toISOString().replace(/[:.]/g, '-')
const outPath = 'outbox/fork-point-real-wp-sweep-probe-' + stamp + '.txt'
const out = []
const log = s => { out.push(s); console.log(s); try { writeFileSync(outPath, out.join('\n')) } catch {} }

const PREVIEW_URL = process.env.PREVIEW_URL || 'http://127.0.0.1:4173'
const MANUAL_PAIRING_COUNT = 6
const RANKED_PAIRING_COUNT = 2

async function getForkRoot(page) {
  return page.evaluateHandle(() => {
    const labels = Array.from(document.querySelectorAll('span'))
    const label = labels.find(s => s.textContent.trim() === 'Fork Point')
    return label.closest('div').parentElement
  })
}

async function waitSettled(page) {
  await page.waitForFunction(() => {
    const labels = Array.from(document.querySelectorAll('span'))
    const label = labels.find(s => s.textContent.trim() === 'Fork Point')
    const text = label.closest('div').parentElement.textContent
    return !text.includes('Fetching real win probability')
  }, { timeout: 20000 })
}

function classify(text) {
  if (text.includes('unavailable for')) return 'unavailable'
  if (text.includes('real win probability') && text.includes('Baseball Savant')) return 'real-wp'
  return 'unknown'
}

async function main() {
  log('probe_at: ' + new Date().toISOString())
  log('purpose: sweep several REAL source/fork pairings (not just the default) through the real-WP')
  log('toggle against the ACTUAL real hosts -- confirms each renders honestly, closing the gap the')
  log('first e2e probe (single pairing) left open.')
  log('')

  const browser = await chromium.launch()
  const page = await browser.newPage()
  const pageErrors = []
  page.on('pageerror', e => pageErrors.push(String(e)))

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

  const forkRoot = await getForkRoot(page)
  const poolSize = await forkRoot.evaluate(root => root.querySelectorAll('select')[0].options.length)
  log('real candidate pool size (from Source game dropdown): ' + poolSize)

  const checkbox = await forkRoot.evaluateHandle(root => root.querySelector('input[type=checkbox]'))
  await checkbox.evaluate(el => el.click())
  log('real WP toggle switched on.')
  log('')

  const results = []
  async function recordPairing(label) {
    await waitSettled(page)
    const text = await forkRoot.evaluate(root => root.innerText)
    const outcome = classify(text)
    const detail = text.split('\n').find(l => l.includes("'s real win probability") || l.includes('unavailable for')) || ''
    results.push({ label, outcome })
    log(label + ' -> ' + outcome + (detail ? '  ' + detail.slice(0, 140) : ''))
  }

  await recordPairing('pairing 0 (already covered by the first e2e probe): default source=0, fork=1')

  // Manual pairings spread across the real pool.
  const step = Math.max(1, Math.floor(poolSize / (MANUAL_PAIRING_COUNT + 1)))
  for (let i = 1; i <= MANUAL_PAIRING_COUNT; i++) {
    const s = (i * step) % poolSize
    let f = (s + step) % poolSize
    if (f === s) f = (s + 1) % poolSize
    const sourceSelect = await forkRoot.evaluateHandle(root => root.querySelectorAll('select')[0])
    await sourceSelect.evaluate((el, v) => { el.value = String(v); el.dispatchEvent(new Event('input', { bubbles: true })) }, s)
    await page.waitForTimeout(200)
    const forkSelect = await forkRoot.evaluateHandle(root => root.querySelectorAll('select')[1])
    await forkSelect.evaluate((el, v) => { el.value = String(v); el.dispatchEvent(new Event('input', { bubbles: true })) }, f)
    await recordPairing(`manual pairing ${i}: source=${s}, fork=${f}`)
  }

  // A couple of the app's OWN "Biggest real forks" ranked picks for the
  // current source game -- these are the pairings a real user is most
  // likely to actually click.
  for (let i = 0; i < RANKED_PAIRING_COUNT; i++) {
    const rankedBtn = await forkRoot.evaluateHandle((root, idx) => root.querySelectorAll('[class*="rankedForkBtn"]')[idx], i)
    const exists = await rankedBtn.evaluate(el => !!el)
    if (!exists) { log(`ranked pairing ${i + 1}: skipped, fewer than ${i + 1} ranked forks for the current source game`); continue }
    const btnText = await rankedBtn.evaluate(el => el.textContent.trim())
    await rankedBtn.evaluate(el => el.click())
    await recordPairing(`ranked pairing ${i + 1} (${btnText}): source unchanged, fork set by ranked pick`)
  }

  log('')
  log('=== RESULT ===')
  const realWp = results.filter(r => r.outcome === 'real-wp').length
  const unavailable = results.filter(r => r.outcome === 'unavailable').length
  const unknown = results.filter(r => r.outcome === 'unknown').length
  log(`${results.length} real pairings swept: ${realWp} real-WP, ${unavailable} honest-unavailable, ${unknown} unknown/neither`)
  log('page errors: ' + JSON.stringify(pageErrors))
  log('')

  log('=== VERDICT ===')
  if (pageErrors.length) {
    log('NOT CONFIRMED: real page errors occurred during the sweep -- see above.')
  } else if (unknown > 0) {
    log('NOT CONFIRMED: at least one real pairing rendered neither a real WP verdict nor the honest')
    log('unavailable message -- a real silent-failure gap. Investigate before trusting this further.')
  } else {
    log('CONFIRMED: every real pairing swept rendered honestly -- real WP data or the disclosed')
    log('unavailable message, never silence.' +
        (unavailable > 0
          ? ' ' + unavailable + '/' + results.length + ' hit the real unavailable path -- a REAL (not mocked) failure was observed, see above.'
          : ' 0/' + results.length + ' hit the unavailable path this run (none observed, not a guarantee it never will).'))
  }

  await browser.close()
}

main().catch(e => { log('FAILED: ' + String(e)); process.exit(1) })
