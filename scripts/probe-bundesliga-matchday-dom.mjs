// Two real, distinct questions left open by jubilant-bassoon's own
// CC-CMD execution today:
//   1. The matchday-switcher selector search found zero matches
//      (button:has-text('Matchday') etc never matched the real DOM).
//      Rather than guessing another selector pattern, this dumps the
//      real DOM structure around anything matchday-related so a
//      correct selector can be written from actual evidence.
//   2. Both wapp.bapi.bundesliga.com endpoints returned 403 today
//      (were 200 at original discovery). This checks whether a real
//      browser, loading the real page normally, still gets a real 200
//      -- which would mean the 403s are a missing-context problem
//      (Origin/Referer/session), not a genuine access change.
//
// Diagnostic only, not production. Findings feed a follow-up CC-CMD.

import { chromium } from 'playwright'
import { mkdirSync, writeFileSync } from 'node:fs'

mkdirSync('outbox', { recursive: true })
const stamp = new Date().toISOString().replace(/[:.]/g, '-')
const outPath = 'outbox/bundesliga-matchday-dom-' + stamp + '.txt'
const out = []
const log = s => {
  out.push(s); console.log(s)
  try { writeFileSync(outPath, out.join('\n')) } catch {}
}

async function main() {
  log('probe_at: ' + new Date().toISOString())
  log('')

  const browser = await chromium.launch()
  const page = await browser.newPage()

  let bapiRequestSeen = false
  let bapiStatus = null
  let bapiHeaders = null
  page.on('request', req => {
    if (req.url().includes('wapp.bapi.bundesliga.com/broadcasts/')) {
      bapiHeaders = req.headers()
    }
  })
  page.on('response', res => {
    if (res.url().includes('wapp.bapi.bundesliga.com/broadcasts/')) {
      bapiRequestSeen = true
      bapiStatus = res.status()
    }
  })

  log('=== NAVIGATING to real live matchday page ===')
  await page.goto('https://www.bundesliga.com/en/bundesliga/matchday', { timeout: 30000, waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(8000)

  log('')
  log('=== QUESTION 1: does a real page load still get a real 200 from wapp.bapi? ===')
  log('bapiRequestSeen: ' + bapiRequestSeen)
  log('bapiStatus: ' + bapiStatus)
  if (bapiRequestSeen && bapiStatus === 200) {
    log('REAL FINDING: a real browser context still gets 200. The 403 the standalone probe hit is a missing-context problem (no real Origin/Referer/cookies), not a genuine access change.')
  } else if (bapiRequestSeen && bapiStatus !== 200) {
    log('REAL FINDING: even a real browser gets ' + bapiStatus + ' now. This is a genuine access change, not a probe-context gap.')
  } else {
    log('The page did not request wapp.bapi at all during this load -- worth knowing on its own.')
  }

  log('')
  log('=== real wapp.bapi request headers, as the browser actually sent them ===')
  if (bapiHeaders) {
    for (const [k, v] of Object.entries(bapiHeaders)) log('  ' + k + ': ' + v)
  } else {
    log('not captured')
  }

  log('')
  log('=== QUESTION 2: real DOM structure around anything matchday-related ===')
  const domInfo = await page.evaluate(() => {
    const candidates = [...document.querySelectorAll('*')].filter(el => {
      const text = (el.textContent || '').trim()
      return text.length < 40 && /matchday|jornada|spieltag/i.test(text) && el.children.length === 0
    })
    return candidates.slice(0, 10).map(el => ({
      tag: el.tagName,
      text: el.textContent?.trim().slice(0, 40),
      class: el.className?.toString().slice(0, 80),
      id: el.id,
      dataAttrs: Object.keys(el.dataset || {}),
    }))
  })
  log(JSON.stringify(domInfo, null, 2))

  await browser.close()
  log('')
  log('=== DONE ===')
}

main().catch(e => { log('SCRIPT FAILED: ' + String(e)); process.exit(1) })
