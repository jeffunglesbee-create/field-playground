// Real, direct follow-up to a second-order question: the live-browser
// network-capture method found real, undocumented backends for BOTH
// LaLiga and Bundesliga this session. That's not a coincidence worth
// leaving unexamined -- if it holds for Serie A and Ligue 1 too, the
// entire SOCCER_LEAGUES gap (La Liga/Serie A/Ligue 1 all missing
// card-creation, confirmed earlier today) could close in one pass
// instead of three separate investigations.
//
// Same method, same safety discipline: passive observation only, no
// forced auth-walled/internal endpoint probing, categorize by resource
// type afterward rather than guessing a hostname up front.

import { chromium } from 'playwright'
import { mkdirSync, writeFileSync } from 'node:fs'

mkdirSync('outbox', { recursive: true })
const stamp = new Date().toISOString().replace(/[:.]/g, '-')
const outPath = 'outbox/seriea-ligue1-capture-' + stamp + '.txt'
const out = []
const log = s => {
  out.push(s); console.log(s)
  try { writeFileSync(outPath, out.join('\n')) } catch {}
}

const TARGETS = [
  { name: 'Serie A', url: 'https://www.legaseriea.it/en' },
  { name: 'Ligue 1', url: 'https://www.ligue1.com/' },
]

async function captureOne(browser, name, url) {
  log('')
  log('=== ' + name + ': ' + url + ' ===')
  const page = await browser.newPage()
  const allRequests = []
  page.on('request', req => {
    try {
      const u = new URL(req.url())
      allRequests.push({ method: req.method(), url: req.url(), resourceType: req.resourceType(), hostname: u.hostname })
    } catch {}
  })
  const responseInfo = new Map()
  page.on('response', res => {
    try { responseInfo.set(res.url(), { status: res.status(), contentType: res.headers()['content-type'] || '' }) } catch {}
  })

  try {
    const nav = await page.goto(url, { timeout: 30000, waitUntil: 'domcontentloaded' })
    log('navigation status: ' + nav?.status())
  } catch (e) {
    log('NAVIGATION FAILED: ' + e.message)
    await page.close()
    return
  }
  await page.waitForTimeout(8000)

  const byHost = {}
  for (const r of allRequests) byHost[r.hostname] = (byHost[r.hostname] || 0) + 1
  log('by host: ' + JSON.stringify(byHost, null, 2))

  log('real candidates (xhr/fetch resourceType, or json content-type, excluding the site\'s own www host):')
  const urlHost = new URL(url).hostname
  const candidates = allRequests.filter(r => {
    if (r.hostname === urlHost) return false
    const info = responseInfo.get(r.url) || {}
    return r.resourceType === 'xhr' || r.resourceType === 'fetch' || (info.contentType || '').includes('json')
  })
  for (const r of candidates) {
    const info = responseInfo.get(r.url) || {}
    log('  ' + r.method + ' ' + r.url + '  (status: ' + (info.status ?? '?') + ', content-type: ' + (info.contentType || '?') + ')')
  }
  if (!candidates.length) log('  none found')

  await page.close()
}

async function main() {
  log('probe_at: ' + new Date().toISOString())
  log('purpose: does the LaLiga/Bundesliga live-capture method also surface real Serie A / Ligue 1 backends?')

  const browser = await chromium.launch()
  for (const t of TARGETS) await captureOne(browser, t.name, t.url)
  await browser.close()

  log('')
  log('=== DONE ===')
}

main().catch(e => { log('SCRIPT FAILED: ' + String(e)); process.exit(1) })
