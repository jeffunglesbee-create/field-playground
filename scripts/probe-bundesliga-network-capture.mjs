// Bundesliga real network capture -- same proven method as
// scripts/probe-laliga-network-capture.mjs, adapted for a genuinely
// different starting point: LaLiga's investigation started with a
// specific hostname hypothesis (apim.laliga.com) from a static search.
// Bundesliga's site has no __NEXT_DATA__ at all (confirmed against the
// user's own uploaded page capture -- zero occurrences, different tech
// stack entirely, not Next.js), and no api-like subdomain surfaced in
// a static scan of that same upload. So this captures EVERYTHING to
// any *.bundesliga.com host, unfiltered by any prior hostname guess,
// and categorizes by resource type + response shape afterward --
// the honest, unbiased version of the same technique.
//
// SAFETY: cp.bundesliga.com is a real, identified third-party paywall/
// consent vendor (Contentpass -- confirmed from the user's own upload:
// "Contentpass + OneTrust Integration", real cpPropertyId shipped in
// the page's own script). This script never navigates to, clicks
// toward, or manually targets cp.bundesliga.com, or attempts to
// interact with any paywall/subscription/login flow. If the real page
// makes a request to it during normal passive rendering, that is
// logged like any other host -- observed, never manually triggered.
//
// CI-AS-PROXY: same pattern as every other real-data probe this
// session -- run via GitHub Actions, not this sandbox.

import { chromium } from 'playwright'
import { mkdirSync, writeFileSync } from 'node:fs'

mkdirSync('outbox', { recursive: true })
const stamp = new Date().toISOString().replace(/[:.]/g, '-')
const outPath = 'outbox/bundesliga-network-capture-' + stamp + '.txt'
const out = []
const log = s => {
  out.push(s); console.log(s)
  try { writeFileSync(outPath, out.join('\n')) } catch {}
}

// Hosts already identified as non-data (assets/tracking/paywall) from
// the user's own uploaded page capture, checked ahead of time so the
// real findings below aren't buried under expected noise.
const KNOWN_NON_DATA_HOSTS = new Set([
  'assets.bundesliga.com', // images
  'mt.bundesliga.com',     // Matomo analytics
  'cp.bundesliga.com',     // Contentpass paywall -- never manually targeted
])

async function main() {
  log('probe_at: ' + new Date().toISOString())
  log('purpose: capture REAL network requests a real browser makes rendering bundesliga.com -- no prior hostname hypothesis, unlike the LaLiga probe')
  log('SAFETY: this script never navigates to or manually requests cp.bundesliga.com (identified paywall vendor) at any point')
  log('')

  const browser = await chromium.launch()
  const page = await browser.newPage()

  const allRequests = []
  page.on('request', req => {
    try {
      const url = new URL(req.url())
      if (!url.hostname.endsWith('bundesliga.com')) return
      allRequests.push({ method: req.method(), url: req.url(), resourceType: req.resourceType(), hostname: url.hostname })
    } catch { /* malformed URL, ignore */ }
  })
  const responseInfo = new Map() // url -> {status, contentType}
  page.on('response', res => {
    try {
      const url = new URL(res.url())
      if (!url.hostname.endsWith('bundesliga.com')) return
      responseInfo.set(res.url(), { status: res.status(), contentType: res.headers()['content-type'] || '' })
    } catch { /* ignore */ }
  })

  log('=== NAVIGATING (real page load, capturing real network activity) ===')
  try {
    const res = await page.goto('https://www.bundesliga.com/en/bundesliga', { timeout: 30000, waitUntil: 'domcontentloaded' })
    log('navigation status: ' + res?.status())
  } catch (e) {
    log('NAVIGATION FAILED: ' + e.message)
    await browser.close()
    return
  }

  // Let deferred/polling client-side fetches fire.
  await page.waitForTimeout(8000)

  // Try to find a real standings link on the page and navigate there
  // too -- the homepage alone may not fire a standings-specific fetch.
  log('')
  log('=== looking for a real standings/table link on the rendered page ===')
  const standingsHref = await page.evaluate(() => {
    const links = [...document.querySelectorAll('a[href]')]
    const match = links.find(a => /table|standings|clasificacion/i.test(a.href) || /table|standings/i.test(a.textContent || ''))
    return match ? match.href : null
  }).catch(() => null)
  log('found link: ' + (standingsHref || 'none'))
  if (standingsHref) {
    try {
      await page.goto(standingsHref, { timeout: 20000, waitUntil: 'domcontentloaded' })
      await page.waitForTimeout(6000)
      log('navigated to standings page successfully')
    } catch (e) {
      log('standings navigation failed (non-fatal): ' + e.message)
    }
  }

  log('')
  log('=== ALL REAL REQUESTS TO *.bundesliga.com ===')
  log('total: ' + allRequests.length)
  const byHost = {}
  for (const r of allRequests) byHost[r.hostname] = (byHost[r.hostname] || 0) + 1
  log('by host: ' + JSON.stringify(byHost, null, 2))

  log('')
  log('=== REQUESTS TO HOSTS NOT ALREADY KNOWN AS NON-DATA (the real candidates) ===')
  const candidates = allRequests.filter(r => !KNOWN_NON_DATA_HOSTS.has(r.hostname) && r.hostname !== 'www.bundesliga.com')
  log('count: ' + candidates.length)
  for (const r of candidates) {
    const info = responseInfo.get(r.url) || {}
    log('  ' + r.method + ' ' + r.url + '  (type: ' + r.resourceType + ', status: ' + (info.status ?? '?') + ', content-type: ' + (info.contentType || '?') + ')')
  }

  log('')
  log('=== www.bundesliga.com requests that look like DATA, not page assets (xhr/fetch resourceType, or json content-type) ===')
  const wwwDataLike = allRequests.filter(r => {
    if (r.hostname !== 'www.bundesliga.com') return false
    const info = responseInfo.get(r.url) || {}
    return r.resourceType === 'xhr' || r.resourceType === 'fetch' || (info.contentType || '').includes('json')
  })
  log('count: ' + wwwDataLike.length)
  for (const r of wwwDataLike) {
    const info = responseInfo.get(r.url) || {}
    log('  ' + r.method + ' ' + r.url + '  (status: ' + (info.status ?? '?') + ', content-type: ' + (info.contentType || '?') + ')')
  }

  await browser.close()
  log('')
  log('=== DONE ===')
}

main().catch(e => { log('SCRIPT FAILED: ' + String(e)); process.exit(1) })
