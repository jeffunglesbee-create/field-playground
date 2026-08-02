// Diagnostic for the LaLiga apim auth failure found in jubilant-
// bassoon's own CC-CMD execution today: 4 guessed header/query
// variants all returned 401 against a rotated subscription key. This
// takes a different approach on purpose -- rather than guessing
// another header combination, let a real browser load the real page
// and make the real, successful request naturally, then capture its
// exact headers and cookies. Same method that found apim.laliga.com
// in the first place; the standalone-request approach never re-used it
// for auth specifically.
//
// This is diagnostic only. It does not touch production. Any real
// finding here feeds a follow-up CC-CMD in jubilant-bassoon, written
// with the actual auth shape instead of another guess.

import { chromium } from 'playwright'
import { mkdirSync, writeFileSync } from 'node:fs'

mkdirSync('outbox', { recursive: true })
const stamp = new Date().toISOString().replace(/[:.]/g, '-')
const outPath = 'outbox/laliga-apim-real-headers-' + stamp + '.txt'
const out = []
const log = s => {
  out.push(s); console.log(s)
  try { writeFileSync(outPath, out.join('\n')) } catch {}
}

async function main() {
  log('probe_at: ' + new Date().toISOString())
  log('purpose: capture the REAL headers/cookies a successful clasificacion request carries, not another guess')
  log('')

  const browser = await chromium.launch()
  const page = await browser.newPage()

  let clasificacionRequest = null
  let clasificacionResponse = null
  page.on('request', req => {
    if (req.url().includes('/digitalassets/clasificacion')) {
      clasificacionRequest = {
        url: req.url(),
        method: req.method(),
        headers: req.headers(),
      }
    }
  })
  page.on('response', res => {
    if (res.url().includes('/digitalassets/clasificacion')) {
      clasificacionResponse = { status: res.status() }
    }
  })

  log('=== NAVIGATING to real live standings page ===')
  await page.goto('https://www.laliga.com/en-US/laliga-easports/standing', { timeout: 30000, waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(8000)

  log('')
  log('=== REAL clasificacion REQUEST, AS THE BROWSER ACTUALLY SENT IT ===')
  if (clasificacionRequest) {
    log('status: ' + (clasificacionResponse?.status ?? 'unknown'))
    log('url: ' + clasificacionRequest.url)
    log('real headers:')
    for (const [k, v] of Object.entries(clasificacionRequest.headers)) {
      log('  ' + k + ': ' + v)
    }
  } else {
    log('NOT CAPTURED -- the page did not request clasificacion during this load. Real finding: either the page fetches it differently now, or from a different trigger than page load alone.')
  }

  log('')
  log('=== real cookies present for this domain at request time ===')
  const cookies = await page.context().cookies('https://www.laliga.com')
  for (const c of cookies) log('  ' + c.name + '=' + (c.value?.slice(0, 40) ?? '') + (c.value?.length > 40 ? '...' : ''))

  await browser.close()
  log('')
  log('=== DONE ===')
}

main().catch(e => { log('SCRIPT FAILED: ' + String(e)); process.exit(1) })
