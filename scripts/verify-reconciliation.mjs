// Real browser verification, covering five related claims in one
// session: (1) docs/EXPERIMENT-live-reconciliation.md's core claim --
// does deskStore's reconcile() keep GameRow identity stable across a
// poll, CONFIRMED 2026-07-25; (2) collapsible sport groups; (3) PickEm
// pending -> correct/incorrect; (4) game-transition toast via <Portal>;
// (5) date browser -- does clicking next/prev day actually request and
// display the correct new date.
//
// Per Rule 90 (VERIFY-ARTIFACT-A): real JSON manifest, falsifiable
// fields, not a bare pass/fail assertion.
//
// 2026-07-25: the mock previously returned a hardcoded date regardless
// of what was actually requested -- fine for the poll-cycle tests (same
// date, repeated calls) but meant there was nothing to check for the
// date browser specifically. Fixed: the mock now parses the real
// requested date out of the route's own URL and echoes it back, the
// same way the actual relay would.

import { spawn } from 'node:child_process'
import { mkdirSync, writeFileSync, existsSync } from 'node:fs'
import { chromium } from 'playwright'

const SERVE_PORT = 4173
const SERVE_URL = `http://localhost:${SERVE_PORT}`

mkdirSync('outbox', { recursive: true })
const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
const checkpointPath = `outbox/reconciliation-check-checkpoints-${timestamp}.json`
const checkpoints = []

function checkpoint(name, extra = {}) {
  checkpoints.push({ name, t: Date.now(), ...extra })
  try {
    writeFileSync(checkpointPath, JSON.stringify(checkpoints, null, 2))
  } catch { /* best effort */ }
}

checkpoint('script_started')

function sh(cmd, args, opts = {}) {
  return spawn(cmd, args, { stdio: 'pipe', ...opts })
}

async function waitForServer(url, timeoutMs = 15000) {
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(url)
      if (res.ok) return true
    } catch { /* not up yet */ }
    await new Promise(r => setTimeout(r, 300))
  }
  throw new Error(`static server did not come up within ${timeoutMs}ms`)
}

// Now takes the REAL requested date, echoed back in the response --
// pollCount still drives the pre/live/final staging for the poll-cycle
// tests, independent of which date was requested.
function mockContextResponse(requestedDate, pollCount) {
  const stage = pollCount >= 3 ? 'final' : pollCount === 2 ? 'live' : 'pre'
  const houTex = {
    id: '2026-07-25-mlb-hou-tex', sport: 'MLB', home: 'Texas Rangers', away: 'Houston Astros',
    home_score: stage === 'pre' ? null : 1,
    away_score: stage === 'pre' ? null : 2,
    venue: 'Globe Life Field',
    finalized_at: stage === 'final' ? '2026-07-25T05:00:00Z' : null,
    went_to_ot: null,
  }
  return {
    ok: true,
    date: requestedDate,
    games: {
      regular: [
        { id: '2026-07-25-mlb-nym-phi', sport: 'MLB', home: 'Philadelphia Phillies', away: 'NY Mets', home_score: 4, away_score: 2, venue: 'Citizens Bank Park', finalized_at: '2026-07-25T02:15:00Z', went_to_ot: null },
        houTex,
      ],
      postseason: [],
    },
    briefs: [], series: [], standings: [],
  }
}

function mockNewspaperResponse() {
  return { ok: true, date: '2026-07-25', recap_date: '2026-07-24', generated_at: '2026-07-25T06:00:00Z', morning_report: 'Test data.', pick: { ranked: [] } }
}

async function readHouTexState(page) {
  return page.evaluate(() => {
    const rows = Array.from(document.querySelectorAll('[class*="gameRow"]'))
    for (const row of rows) {
      if (row.textContent.includes('Texas Rangers')) {
        const dot = row.querySelector('[class*="statusDot"]')
        return { text: row.textContent.trim(), statusClass: dot ? dot.className : null }
      }
    }
    return null
  })
}

async function tagRowIdentities(page) {
  await page.evaluate(() => {
    window.__rowIdentity = new Map()
    document.querySelectorAll('[class*="gameRow"]').forEach(row => {
      const matchupEl = row.querySelector('[class*="matchup"]')
      const key = matchupEl ? matchupEl.textContent.trim() : row.textContent.trim().slice(0, 40)
      window.__rowIdentity.set(key, row)
    })
    window.__removedGameRows = []
    const observer = new MutationObserver(mutations => {
      for (const m of mutations) {
        m.removedNodes.forEach(n => {
          if (n.nodeType === 1 && typeof n.className === 'string' && n.className.includes('gameRow')) {
            window.__removedGameRows.push((n.textContent || '').trim().slice(0, 40))
          }
        })
      }
    })
    observer.observe(document.body, { childList: true, subtree: true })
  })
}

async function checkRowIdentities(page) {
  return page.evaluate(() => {
    const results = []
    for (const [key, oldNode] of window.__rowIdentity.entries()) {
      let sameNodeStillAtKey = false
      document.querySelectorAll('[class*="gameRow"]').forEach(row => {
        const matchupEl = row.querySelector('[class*="matchup"]')
        const rowKey = matchupEl ? matchupEl.textContent.trim() : row.textContent.trim().slice(0, 40)
        if (rowKey === key && row === oldNode) sameNodeStillAtKey = true
      })
      results.push({ key, stillConnected: oldNode.isConnected, sameNodeReference: sameNodeStillAtKey })
    }
    return { rows: results, removedGameRows: window.__removedGameRows || [] }
  })
}

async function main() {
  const manifest = { timestamp, checks: [] }

  checkpoint('checking_dist_exists')
  if (!existsSync('dist/index.html')) {
    checkpoint('FATAL_dist_missing')
    throw new Error('dist/index.html not found -- npm run build must run before this script')
  }
  checkpoint('dist_confirmed_present')

  const server = sh('python3', ['-m', 'http.server', String(SERVE_PORT), '--directory', 'dist'])
  checkpoint('static_server_spawned', { pid: server.pid })
  let serverOutput = ''
  server.stdout.on('data', d => { serverOutput += d })
  server.stderr.on('data', d => { serverOutput += d })
  server.on('error', e => checkpoint('static_server_spawn_error', { error: String(e) }))

  try {
    await waitForServer(SERVE_URL)
    checkpoint('static_server_responding')

    const browser = await chromium.launch()
    checkpoint('browser_launched')
    const page = await browser.newPage()
    checkpoint('page_created')

    let pollCount = 0
    const requestedDates = []
    await page.route('**/context/date/**', route => {
      const url = route.request().url()
      const match = url.match(/\/context\/date\/([^/?]+)/)
      const requestedDate = match ? match[1] : 'unknown'
      requestedDates.push(requestedDate)
      pollCount++
      route.fulfill({ json: mockContextResponse(requestedDate, pollCount) })
    })
    await page.route('**/analytics/newspaper/**', route => route.fulfill({ json: mockNewspaperResponse() }))
    await page.route('**/wc/standings**', route => route.fulfill({ json: { groups: {} } }))
    await page.route('**/mlb-stats/standings**', route => route.fulfill({ json: { records: [] } }))
    await page.route('**/mls/stats/**', route => route.fulfill({ json: { tables: [{ entries: [] }] } }))
    checkpoint('routes_registered')

    await page.goto(SERVE_URL, { timeout: 15000 })
    checkpoint('page_navigated')
    await page.waitForSelector('[class*="gameRow"]', { timeout: 15000 })
    checkpoint('gameRow_selector_found')
    await page.waitForTimeout(500)

    const initialDate = requestedDates[0]
    manifest.initialDate = initialDate
    checkpoint('initial_date_captured', { initialDate })

    const initialHouTex = await readHouTexState(page)
    manifest.initialHouTexState = initialHouTex
    checkpoint('initial_state_read', { initialHouTex })
    await page.screenshot({ path: `outbox/reconciliation-check-initial-${timestamp}.png` })

    await tagRowIdentities(page)
    checkpoint('row_identities_tagged')

    const watchButtons = await page.$$('[class*="watchBtn"]')
    let starredHouTex = false
    for (const btn of watchButtons) {
      const row = await btn.evaluateHandle(el => el.closest('[class*="gameRow"]'))
      const text = await row.evaluate(el => el?.textContent || '')
      if (text.includes('Texas Rangers')) {
        await btn.click()
        starredHouTex = true
        break
      }
    }
    manifest.starredHouTex = starredHouTex
    checkpoint('watchlist_star_clicked', { starredHouTex })

    const pickEmButtons = await page.$$('[class*="pickBtn"]')
    let pickedHouTex = false
    for (const btn of pickEmButtons) {
      const text = await btn.textContent()
      if (text && text.trim() === 'Houston Astros') {
        await btn.click()
        pickedHouTex = true
        break
      }
    }
    manifest.pickedHouTexAstros = pickedHouTex
    checkpoint('pickem_pick_made', { pickedHouTex })

    const pickStatusAfterPick = await page.evaluate(() => {
      const badges = Array.from(document.querySelectorAll('[class*="statusBadge"]'))
      for (const b of badges) {
        const row = b.closest('[class*="pickRow"]')
        if (row && row.textContent.includes('Texas Rangers')) return b.textContent.trim()
      }
      return null
    })
    manifest.pickStatusAfterPick = pickStatusAfterPick
    checkpoint('pick_status_read_pre_poll', { pickStatusAfterPick })

    await page.evaluate(() => new Promise(r => setTimeout(r, 16000)))
    checkpoint('first_poll_wait_complete')
    await page.evaluate(() => new Promise(r => setTimeout(r, 16000)))
    checkpoint('second_poll_wait_complete')

    const toastPresent = await page.evaluate(() => {
      const toasts = Array.from(document.querySelectorAll('[class*="toast"]'))
      return toasts.some(t => t.textContent.includes('Final') && t.textContent.includes('Rangers'))
    })
    manifest.toastPresent = toastPresent
    checkpoint('toast_checked', { toastPresent })
    await page.screenshot({ path: `outbox/reconciliation-check-toast-${timestamp}.png` })

    const afterHouTex = await readHouTexState(page)
    const identityCheck = await checkRowIdentities(page)
    manifest.afterHouTexState = afterHouTex
    manifest.domIdentityCheck = identityCheck
    manifest.pollCount = pollCount
    checkpoint('after_state_read', { afterHouTex, pollCount })

    const pickStatusFinal = await page.evaluate(() => {
      const badges = Array.from(document.querySelectorAll('[class*="statusBadge"]'))
      for (const b of badges) {
        const row = b.closest('[class*="pickRow"]')
        if (row && row.textContent.includes('Texas Rangers')) return b.textContent.trim()
      }
      return null
    })
    manifest.pickStatusFinal = pickStatusFinal
    checkpoint('pick_status_read_post_poll', { pickStatusFinal })

    const starredStillAfterPoll = await page.evaluate(() => {
      const rows = Array.from(document.querySelectorAll('[class*="gameRow"]'))
      for (const row of rows) {
        if (row.textContent.includes('Texas Rangers')) {
          const btn = row.querySelector('[class*="watchBtn"]')
          return btn ? btn.textContent.trim() === '★' : false
        }
      }
      return false
    })
    manifest.starredStillAfterPoll = starredStillAfterPoll
    checkpoint('watchlist_persistence_checked', { starredStillAfterPoll })

    await page.screenshot({ path: `outbox/reconciliation-check-after-${timestamp}.png` })

    // Collapse testing before date-browser -- both remove/replace rows,
    // keep them separated from checks that need rows present.
    await page.click('[class*="sportLabel"]')
    checkpoint('mlb_group_clicked')
    const collapsedImmediately = await page.evaluate(() => document.querySelectorAll('[class*="gameRow"]').length === 0)
    manifest.collapsedImmediately = collapsedImmediately
    checkpoint('collapse_checked')

    await page.evaluate(() => new Promise(r => setTimeout(r, 16000)))
    checkpoint('third_poll_wait_for_collapse_persistence')
    const collapsedAfterPoll = await page.evaluate(() => document.querySelectorAll('[class*="gameRow"]').length === 0)
    manifest.collapsedAfterPoll = collapsedAfterPoll
    checkpoint('collapse_persistence_checked', { collapsedImmediately, collapsedAfterPoll })

    // Date browser LAST. Re-expand the group first so the date-meta
    // display and next-day request are actually observable.
    await page.click('[class*="sportLabel"]')
    checkpoint('mlb_group_reexpanded')
    await page.waitForTimeout(300)

    const datesBeforeNav = requestedDates.length
    await page.click('[class*="dateBtn"]:last-of-type') // '›' next-day button
    checkpoint('next_day_clicked')
    await page.waitForTimeout(3000)

    const nextDateRequested = requestedDates[requestedDates.length - 1]
    const expectedNextDate = (() => {
      const d = new Date(initialDate + 'T00:00:00Z')
      d.setUTCDate(d.getUTCDate() + 1)
      return d.toISOString().split('T')[0]
    })()
    manifest.nextDateRequested = nextDateRequested
    manifest.expectedNextDate = expectedNextDate
    manifest.newRequestMadeOnClick = requestedDates.length > datesBeforeNav
    checkpoint('date_browser_next_checked', { nextDateRequested, expectedNextDate, requestedDates })

    const displayedDateAfterNav = await page.evaluate(() => {
      // Scoped to dateBrowser specifically -- a bare [class*="dateMeta"]
      // is ambiguous: AmbientPanel has its own dateMeta class too (CSS
      // Modules preserves the name as a substring of the hash), and
      // AmbientPanel renders first in App.jsx, so an unscoped
      // querySelector silently grabbed AmbientPanel's (stale, since its
      // mock doesn't echo the requested date the way context/date's
      // does) element instead of DeskCard's.
      const el = document.querySelector('[class*="dateBrowser"] [class*="dateMeta"]')
      return el ? el.textContent.trim() : null
    })
    manifest.displayedDateAfterNav = displayedDateAfterNav
    checkpoint('displayed_date_checked', { displayedDateAfterNav })

    // URL-persisted date: after the next-day click above, the address
    // bar's ?d= param should already reflect the new date (initUrlDateSync's
    // createEffect keeps it in sync via replaceState).
    const urlAfterNav = page.url()
    const urlDateParam = new URL(urlAfterNav).searchParams.get('d')
    manifest.urlDateParam = urlDateParam
    checkpoint('url_date_param_checked', { urlAfterNav, urlDateParam })

    // Reload with a DIFFERENT date in the URL directly -- tests
    // initialDateFromUrl(), not just the sync-back direction already
    // covered above.
    const reloadTargetDate = '2026-08-01'
    await page.goto(`${SERVE_URL}/?d=${reloadTargetDate}`, { timeout: 15000 })
    checkpoint('reloaded_with_explicit_url_date')
    await page.waitForSelector('[class*="gameRow"]', { timeout: 15000 })
    await page.waitForTimeout(500)
    const dateAfterUrlReload = requestedDates[requestedDates.length - 1]
    manifest.dateAfterUrlReload = dateAfterUrlReload
    checkpoint('url_reload_date_checked', { dateAfterUrlReload, reloadTargetDate })

    // BroadcastChannel: a second real page in the SAME browser context
    // (context.newPage(), not a second browser -- BroadcastChannel is
    // same-origin/same-context, not same-tab). Change the date via the
    // date browser in page2, check whether page1's currentDate follows
    // without any direct interaction on page1 at all.
    const context = page.context()
    const page2 = await context.newPage()
    checkpoint('second_page_opened_for_broadcast_test')
    await page2.route('**/context/date/**', route => {
      const url = route.request().url()
      const match = url.match(/\/context\/date\/([^/?]+)/)
      const requestedDate = match ? match[1] : 'unknown'
      requestedDates.push(requestedDate)
      pollCount++
      route.fulfill({ json: mockContextResponse(requestedDate, pollCount) })
    })
    await page2.route('**/analytics/newspaper/**', route => route.fulfill({ json: mockNewspaperResponse() }))
    await page2.route('**/wc/standings**', route => route.fulfill({ json: { groups: {} } }))
    await page2.route('**/mlb-stats/standings**', route => route.fulfill({ json: { records: [] } }))
    await page2.route('**/mls/stats/**', route => route.fulfill({ json: { tables: [{ entries: [] }] } }))
    await page2.goto(SERVE_URL, { timeout: 15000 })
    await page2.waitForSelector('[class*="gameRow"]', { timeout: 15000 })
    await page2.waitForTimeout(500)
    checkpoint('page2_loaded')

    await page2.click('[class*="dateBtn"]:last-of-type')
    checkpoint('page2_next_day_clicked')
    await page.waitForTimeout(2000) // let the broadcast propagate to page1

    const page1DateAfterBroadcast = await page.evaluate(() => {
      const el = document.querySelector('[class*="dateBrowser"] [class*="dateMeta"]')
      return el ? el.textContent.trim() : null
    })
    const page2DateAfterOwnClick = await page2.evaluate(() => {
      const el = document.querySelector('[class*="dateBrowser"] [class*="dateMeta"]')
      return el ? el.textContent.trim() : null
    })
    manifest.page1DateAfterBroadcast = page1DateAfterBroadcast
    manifest.page2DateAfterOwnClick = page2DateAfterOwnClick
    checkpoint('broadcast_sync_checked', { page1DateAfterBroadcast, page2DateAfterOwnClick })
    await page2.close()

    await browser.close()
    checkpoint('browser_closed')

    const houTexTransitioned = initialHouTex?.text.includes('—') && !afterHouTex?.text.includes('—') && (afterHouTex?.statusClass?.includes('live') || afterHouTex?.statusClass?.includes('final'))
    manifest.checks.push({ name: 'houtex_transitioned_pre_to_live_or_final', pass: !!houTexTransitioned, initial: initialHouTex, after: afterHouTex })

    const allNodesReused = identityCheck.rows.length > 0 && identityCheck.rows.every(r => r.stillConnected && r.sameNodeReference)
    manifest.checks.push({ name: 'dom_node_references_reused_not_remounted', pass: allNodesReused, detail: identityCheck })

    const noRowsPhysicallyRemoved = identityCheck.removedGameRows.length === 0
    manifest.checks.push({ name: 'no_gamerow_nodes_removed_from_dom', pass: noRowsPhysicallyRemoved, removedGameRows: identityCheck.removedGameRows })

    manifest.checks.push({ name: 'pickem_pick_registered_as_pending', pass: pickedHouTex && pickStatusAfterPick === 'pending', pickStatusAfterPick })
    manifest.checks.push({ name: 'pickem_resolved_correct_after_final', pass: pickStatusFinal === 'correct', pickStatusFinal })

    manifest.checks.push({ name: 'sport_group_collapsed_on_click', pass: !!collapsedImmediately })
    manifest.checks.push({ name: 'collapse_state_survived_poll_cycle', pass: !!collapsedImmediately && !!collapsedAfterPoll })

    manifest.checks.push({ name: 'watchlist_star_survived_poll_cycles', pass: starredHouTex && starredStillAfterPoll })
    manifest.checks.push({ name: 'transition_toast_fired_via_portal', pass: !!toastPresent })

    manifest.checks.push({ name: 'date_browser_requested_correct_next_date', pass: nextDateRequested === expectedNextDate, nextDateRequested, expectedNextDate })
    manifest.checks.push({ name: 'date_browser_displayed_date_updated', pass: displayedDateAfterNav === expectedNextDate, displayedDateAfterNav, expectedNextDate })

    manifest.allPass = manifest.checks.every(c => c.pass)
    checkpoint('manifest_complete', { allPass: manifest.allPass })
    console.log(`Result: ${manifest.allPass ? 'ALL PASS ✓' : 'FAILURES DETECTED ✗'}`)
    console.log(JSON.stringify(manifest, null, 2))
    writeFileSync(`outbox/reconciliation-check-manifest-${timestamp}.json`, JSON.stringify(manifest, null, 2))
    if (!manifest.allPass) process.exitCode = 1
  } catch (err) {
    checkpoint('CAUGHT_ERROR', { error: String(err), stack: err?.stack })
    manifest.error = String(err)
    manifest.serverOutput = serverOutput.slice(-4000)
    writeFileSync(`outbox/reconciliation-check-manifest-${timestamp}.json`, JSON.stringify(manifest, null, 2))
    console.error('FAILED:', err)
    process.exitCode = 1
  } finally {
    server.kill()
    checkpoint('script_ending')
  }
}

process.on('uncaughtException', e => {
  checkpoint('UNCAUGHT_EXCEPTION', { error: String(e), stack: e?.stack })
  process.exit(1)
})
process.on('unhandledRejection', e => {
  checkpoint('UNHANDLED_REJECTION', { error: String(e) })
  process.exit(1)
})

main()
