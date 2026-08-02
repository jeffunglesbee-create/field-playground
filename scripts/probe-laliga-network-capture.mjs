// Follow-up to docs/outbox/cc-session-2026-08-02-laliga-apim-
// investigation.md's own stated next step: static bundle-string search
// (Task 2 of the original CC-CMD) found zero literal apim.laliga.com
// references in laliga.com's client-shipped JS -- a genuine negative,
// but one that couldn't rule out server-side data fetching (Next.js
// getServerSideProps, where the API call never reaches the browser at
// all). This tries the materially different technique flagged as the
// real next step: capture REAL network requests a real browser
// actually makes while the real page renders, rather than searching
// static text for literal strings.
//
// SAFETY, unchanged from the original investigation: apim-int.laliga.com
// is never navigated to, clicked toward, or otherwise manually
// targeted anywhere in this script. If the real page's own client-side
// code happens to call it during normal rendering, that is the site's
// own real behavior being passively observed, not this script probing
// it -- per the original CC-CMD's own instruction ("identify it, do
// not probe it"). No follow-up request is ever made to anything
// identified as apim-int.
//
// CI-AS-PROXY: laliga.com confirmed sandbox-blocked from BOTH curl and
// a local headless browser (ERR_TUNNEL_CONNECTION_FAILED) before this
// script was written -- needs a real GitHub Actions runner with
// unrestricted egress, same as every other real-data probe this
// session, just via a browser instead of raw fetch this time.

import { chromium } from 'playwright'
import { mkdirSync, writeFileSync } from 'node:fs'

mkdirSync('outbox', { recursive: true })
const stamp = new Date().toISOString().replace(/[:.]/g, '-')
const outPath = 'outbox/laliga-network-capture-' + stamp + '.txt'
const out = []
const log = s => {
  out.push(s); console.log(s)
  try { writeFileSync(outPath, out.join('\n')) } catch {}
}

async function main() {
  log('probe_at: ' + new Date().toISOString())
  log('purpose: capture REAL network requests a real browser makes rendering laliga.com -- not a static bundle-string search')
  log('SAFETY: this script never navigates to or manually requests apim-int.laliga.com at any point')
  log('')

  const browser = await chromium.launch()
  const page = await browser.newPage()

  const allLaligaRequests = []
  const apimRequests = []
  page.on('request', req => {
    try {
      const url = new URL(req.url())
      if (!/laliga\.com$/i.test(url.hostname) && !url.hostname.endsWith('.laliga.com')) return
      const entry = { method: req.method(), url: req.url(), resourceType: req.resourceType() }
      allLaligaRequests.push(entry)
      if (url.hostname === 'apim.laliga.com' || url.hostname === 'apim-int.laliga.com') apimRequests.push(entry)
    } catch { /* malformed URL, ignore */ }
  })
  const responseStatuses = new Map()
  page.on('response', res => {
    try {
      const url = new URL(res.url())
      if (url.hostname === 'apim.laliga.com' || url.hostname === 'apim-int.laliga.com') {
        responseStatuses.set(res.url(), res.status())
      }
    } catch { /* ignore */ }
  })

  log('=== NAVIGATING (real page load, capturing real network activity) ===')
  try {
    const res = await page.goto('https://www.laliga.com/en-US', { timeout: 30000, waitUntil: 'domcontentloaded' })
    log('navigation status: ' + res?.status())
  } catch (e) {
    log('NAVIGATION FAILED: ' + e.message)
    await browser.close()
    return
  }

  // Let deferred/polling client-side fetches fire (standings widgets,
  // live-score tickers, etc. often fetch after initial paint, not
  // during it).
  await page.waitForTimeout(8000)

  // Passive extraction of Next.js's own embedded SSR data, if present
  // -- a completely different, zero-interaction technique: if the real
  // standings/leaders data the user's capture showed was fetched
  // SERVER-SIDE (getServerSideProps), it would be embedded here as
  // JSON, not as a client-visible network call at all.
  log('')
  log('=== __NEXT_DATA__ (SSR-embedded JSON, if present) ===')
  const nextData = await page.evaluate(() => {
    const el = document.getElementById('__NEXT_DATA__')
    return el ? el.textContent : null
  }).catch(() => null)
  if (nextData) {
    log('__NEXT_DATA__ present, length: ' + nextData.length)
    // Search the real embedded JSON for the same literal patterns Task 2 searched bundles for.
    const apimMatches = [...nextData.matchAll(/apim[\-a-z]*\.laliga\.com(\/[a-zA-Z0-9\-_/]{0,120})?/gi)]
    log('literal apim*.laliga.com occurrences in __NEXT_DATA__: ' + apimMatches.length)
    for (const m of apimMatches.slice(0, 20)) {
      const idx = m.index ?? 0
      const context = nextData.slice(Math.max(0, idx - 60), idx + m[0].length + 60)
      log('  match: ' + m[0])
      log('  context: ...' + context.replace(/\s+/g, ' ') + '...')
    }
    // Dump top-level pageProps keys -- reveals what real data shape the
    // page actually receives, real field names not guessed ones.
    try {
      const parsed = JSON.parse(nextData)
      const pageProps = parsed?.props?.pageProps
      log('top-level props.pageProps keys: ' + Object.keys(pageProps ?? {}).join(', '))
    } catch (e) {
      log('could not JSON.parse __NEXT_DATA__: ' + e.message)
    }
  } else {
    log('no __NEXT_DATA__ element found on the real rendered page')
  }

  log('')
  log('=== REAL NETWORK REQUESTS TO *.laliga.com (all, during real page load) ===')
  log('total requests to any *.laliga.com host: ' + allLaligaRequests.length)
  const byHost = {}
  for (const r of allLaligaRequests) {
    const h = new URL(r.url).hostname
    byHost[h] = (byHost[h] || 0) + 1
  }
  log('by host: ' + JSON.stringify(byHost))
  log('')

  log('=== REAL REQUESTS SPECIFICALLY TO apim.laliga.com OR apim-int.laliga.com ===')
  log('(passively observed only -- this script never manually navigates to or targets either)')
  log('count: ' + apimRequests.length)
  for (const r of apimRequests) {
    log('  ' + r.method + ' ' + r.url + '  (resourceType: ' + r.resourceType + ')  status: ' + (responseStatuses.get(r.url) ?? 'unknown'))
  }
  if (!apimRequests.length) {
    log('  NONE -- the real page load made zero real requests to either apim host.')
  }

  await browser.close()

  log('')
  log('=== VERDICT ===')
  log('Real browser network capture completed. See counts/matches above for the actual, unguessed result.')
}

main().catch(e => log('FAILED: ' + String(e?.stack || e)))
