// Does the DEPLOYED playground render the sports the relay actually returns?
//
// THE CLAIM UNDER TEST, and it is not the one I checked last time. A previous
// probe measured /context/date/ and found MLB 165, WNBA 29, EFL Cup 32 rows
// across 14 days -- then concluded "the desk faithfully renders the data" from
// a screenshot of 2026-08-06, a date that genuinely contains only MLS. That
// verified the date, not the claim. The real report is that MLB, WNBA and
// EFL Cup are absent from the playground GENERALLY.
//
// So this loads the deployed site itself, on dates the relay is KNOWN to serve
// multiple sports for, and reads which sport groups actually render.
//
// field-playground.jeffunglesbee.workers.dev is a *.workers.dev host and is
// sandbox-blocked from chat, the same block that forces every relay probe here
// through CI. So this runs in CI, against production, with a real browser.
//
// It also reports whether the deployed bundle is CURRENT, by looking for a
// component added on 2026-08-08 (Anomaly Watch). A stale deploy would explain
// a missing-content report all on its own, and ruling it in or out first is
// cheaper than any other hypothesis.

import { mkdirSync, writeFileSync } from 'node:fs'
import { chromium } from 'playwright'

mkdirSync('outbox', { recursive: true })
const stamp = new Date().toISOString().replace(/[:.]/g, '-')
const outPath = 'outbox/deployed-desk-sports-' + stamp + '.txt'
const out = []
const log = s => { out.push(s); console.log(s); try { writeFileSync(outPath, out.join('\n')) } catch {} }

const SITE = process.env.PROBE_SITE || 'https://field-playground.jeffunglesbee.workers.dev'
const RELAY = 'https://field-relay-nba.jeffunglesbee.workers.dev'
// Dates chosen because the relay demonstrably serves several sports on them.
const DATES = (process.env.PROBE_DATES || '2026-08-07,2026-08-08,2026-08-04').split(',')

async function relaySports(date) {
  try {
    const res = await fetch(`${RELAY}/context/date/${date}`)
    if (!res.ok) return { err: 'HTTP ' + res.status }
    const j = await res.json()
    const games = [...(j?.games?.regular ?? []), ...(j?.games?.postseason ?? [])]
    const counts = new Map()
    for (const g of games) counts.set(String(g.sport ?? '(missing)').trim(), (counts.get(String(g.sport ?? '(missing)').trim()) ?? 0) + 1)
    return { counts, total: games.length }
  } catch (e) { return { err: String(e.message) } }
}

async function main() {
  log('probe_at: ' + new Date().toISOString())
  log('purpose: does the DEPLOYED playground render the sports the relay returns?')
  log(`site:  ${SITE}`)
  log(`dates: ${DATES.join(', ')}`)
  log('')

  const browser = await chromium.launch()
  const page = await browser.newPage({ viewport: { width: 1400, height: 1800 } })
  const pageErrors = []
  page.on('pageerror', e => pageErrors.push(String(e)))
  const failedRequests = []
  page.on('requestfailed', r => failedRequests.push(`${r.failure()?.errorText} ${r.url().slice(0, 100)}`))

  // --- deploy freshness first: cheapest hypothesis to rule out ---
  log('=== IS THE DEPLOYED BUILD CURRENT? ===')
  // never networkidle -- this app polls continuously and it would never resolve
  await page.goto(SITE, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(4000)
  // The first version of this check read the landing tab only and reported all
  // three markers ABSENT. That was very likely a tab artifact, not a stale
  // deploy -- every one of those components lives in the Lab tab, which had
  // never been clicked. Reporting "ABSENT" from a tab that cannot contain them
  // is the same too-narrow-sample mistake this probe exists to correct.
  //
  // The tab labels carry their own counts ("Lab\n18"), which is a sharper
  // staleness signal than any string match: the Lab count rose to 18 when
  // Anomaly Watch was added on 2026-08-08, so a deployed count below that is
  // direct evidence of a stale bundle regardless of what text renders.
  const tabTexts = await page.locator('button').allInnerTexts().catch(() => [])
  const tabs = tabTexts.filter(t => /^(Games|Picks|Stats|Journalism|Social|System|Lab)\b/.test(t.trim()))
  log('  tab labels (count is the staleness signal):')
  for (const t of tabs) log(`    ${JSON.stringify(t)}`)
  const labTab = tabs.find(t => /^Lab/.test(t.trim()))
  const labCount = labTab ? Number((labTab.match(/(\d+)/) || [])[1]) : null
  log(`  deployed Lab count: ${labCount ?? 'unknown'}   (local HEAD builds 18 sections)`)
  log('')

  const markers = [
    ['Anomaly Watch', 'component added 2026-08-08'],
    ['Fork Point', 'component added 2026-08-05'],
    ['Leverage Index', 'component added 2026-08-04'],
  ]

  // CASE-INSENSITIVE, and this is not defensive padding -- it is a bug this
  // probe already shipped. innerText returns text as RENDERED, and these
  // component headers set `text-transform: uppercase`, so the DOM says
  // "Anomaly Watch" and innerText says "ANOMALY WATCH". A case-sensitive
  // includes() reported all three ABSENT and concluded the deploy was stale,
  // while the tab label in the very same output read "Lab 18" -- exactly the
  // count that only exists if the newest component IS deployed. Two signals
  // from one run disagreed, and the case-sensitive one was wrong.
  // Third instance of this same class today; the earlier one was a /score/
  // regex against a CSS-uppercased "SCORE".
  const hasMarker = (text, needle) => text.toLowerCase().includes(needle.toLowerCase())

  const landingText = await page.locator('body').innerText().catch(() => '')
  log('  on the LANDING tab (where these are NOT expected to appear):')
  for (const [needle] of markers) {
    log(`    ${hasMarker(landingText, needle) ? 'present' : 'absent '}  "${needle}"`)
  }

  let labText = ''
  try {
    await page.locator('button').filter({ hasText: /^Lab/ }).first().click()
    await page.waitForTimeout(5000)
    labText = await page.locator('body').innerText()
    log('  after clicking the LAB tab (where they live):')
    for (const [needle, when] of markers) {
      log(`    ${hasMarker(labText, needle) ? 'PRESENT' : 'ABSENT '}  "${needle}"  (${when})`)
    }
  } catch (e) {
    log(`  could not open the Lab tab: ${String(e.message).slice(0, 120)}`)
    log('  Deploy freshness therefore UNRESOLVED -- not "stale", not "current".')
  }
  log('')
  if (labText) {
    const present = markers.filter(([n]) => hasMarker(labText, n)).length
    if (present === markers.length) {
      log(`  DEPLOY IS CURRENT: all ${markers.length} recent components render in the Lab tab.`)
    } else if (present === 0) {
      log('  DEPLOY IS STALE: none of the recent components are in the deployed bundle.')
    } else {
      log(`  DEPLOY IS PARTIALLY STALE: ${present}/${markers.length} present -- read the dates above to`)
      log('  bracket when the deployed build was cut.')
    }
    // Two independent signals. If they disagree, say so instead of picking one:
    // the disagreement is itself the finding, and last time the louder signal
    // was the wrong one.
    if (labCount === 18 && present === 0) {
      log('  CONTRADICTION: the Lab tab reports 18 sections -- the count that only exists')
      log('  once the newest component is deployed -- while no marker text was found.')
      log('  Trust neither. Something is wrong with the text match, not the deploy.')
    } else if (labCount != null && labCount < 18 && present === markers.length) {
      log(`  CONTRADICTION: markers all present but Lab count is ${labCount}, below the 18 that`)
      log('  local HEAD builds. Worth reading before concluding anything.')
    }
  }
  log('')

  // --- the actual question ---
  log('=== RELAY SAYS vs DEPLOYED PAGE SHOWS ===')
  for (const date of DATES) {
    const rel = await relaySports(date)
    log(`  ${date}`)
    if (rel.err) { log(`    relay: FAILED ${rel.err}`); continue }
    const relayList = [...rel.counts.entries()].sort((a, b) => b[1] - a[1])
    log(`    relay serves : ${relayList.map(([s, n]) => `${s}:${n}`).join('  ')}   (total ${rel.total})`)

    await page.goto(`${SITE}/?d=${date}`, { waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(5000)
    const text = await page.locator('body').innerText().catch(() => '')

    // Sport group headers render as the raw sport string. Check for each label
    // the relay actually returned rather than a hardcoded expectation.
    const shown = [], missing = []
    for (const [sport] of relayList) {
      // word-boundary match so "wnba" doesn't match inside another token
      const re = new RegExp(`(^|\\W)${sport.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(\\W|$)`, 'i')
      ;(re.test(text) ? shown : missing).push(sport)
    }
    log(`    page shows   : ${shown.join(', ') || '(none)'}`)
    log(`    page MISSING : ${missing.join(', ') || '(none)'}`)
    if (missing.length) {
      log('      ^ relay returned rows for these and the page does not mention them')
    }
  }
  log('')

  if (failedRequests.length) {
    log('=== FAILED REQUESTS (a blocked fetch would explain missing content) ===')
    const seen = new Set()
    for (const f of failedRequests) { if (!seen.has(f)) { seen.add(f); log('  ' + f) } }
    log('')
  }
  if (pageErrors.length) {
    log('=== PAGE ERRORS ===')
    for (const e of pageErrors.slice(0, 8)) log('  ' + e.slice(0, 160))
    log('')
  }

  await page.screenshot({ path: 'outbox/deployed-desk-' + stamp + '.png', fullPage: false }).catch(() => {})
  await browser.close()

  log('=== VERDICT ===')
  log('Read the MISSING lines. If the relay serves a sport for a date and the deployed')
  log('page never mentions it, that is a client or deploy defect and the earlier')
  log('"the desk faithfully renders the data" conclusion was drawn from too narrow a')
  log('sample -- one date that happened to be single-sport.')
  log('If nothing is missing, then the report is about WHICH DATE was on screen, and')
  log('the archive gap (no MLB at all on 2026-08-05/06) is the whole story.')
}

main().catch(e => log('FAILED: ' + String(e?.stack || e)))
