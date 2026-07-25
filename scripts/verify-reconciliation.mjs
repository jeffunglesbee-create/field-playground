// Real browser verification, covering three related claims in one
// session: (1) docs/EXPERIMENT-live-reconciliation.md's core claim --
// does deskStore's reconcile() keep GameRow identity stable across a
// poll, CONFIRMED 2026-07-25 (see that doc for the full chain); (2)
// collapsible sport groups -- does collapse state (a createStore keyed
// by sport name) survive the same poll cycle; (3) PickEm -- does a pick
// resolve from pending to correct/incorrect automatically once
// deskStore's data marks the game final, with zero manual recheck logic.
//
// Per Rule 90 (VERIFY-ARTIFACT-A): real JSON manifest, falsifiable
// fields, not a bare pass/fail assertion.
//
// 2026-07-25: first combined run found two real bugs -- in this script,
// not the app. (a) Collapsing the sport group was tested BEFORE the
// transition/DOM-identity checks -- but <Show when={!isCollapsed()}>
// genuinely removes rows from the DOM when collapsed, by design, so
// checking a collapsed group's row identity afterward was never going
// to find anything. Reordered: transition/identity checks now run
// first, collapse-testing last, so it can't interfere with unrelated
// checks. (b) The mock had home_score(1) > away_score(0), meaning Texas
// Rangers (home) actually won -- but the test picked Houston Astros
// (away) and asserted "correct." PickEm correctly resolved the pick as
// wrong given that data; the test's own expectation was backwards, not
// the app. Fixed the mock so the picked team actually wins.

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

// Poll 1: hou-tex pregame. Poll 2: hou-tex live, Astros (away) leading
// 2-1. Poll 3+: final, Astros (away) win 2-1 -- away_score > home_score
// this time, matching the pick the test actually makes below.
function mockContextResponse(pollCount) {
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
    date: '2026-07-25',
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
    await page.route('**/context/date/**', route => {
      pollCount++
      route.fulfill({ json: mockContextResponse(pollCount) })
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

    const initialHouTex = await readHouTexState(page)
    manifest.initialHouTexState = initialHouTex
    checkpoint('initial_state_read', { initialHouTex })
    await page.screenshot({ path: `outbox/reconciliation-check-initial-${timestamp}.png` })

    await tagRowIdentities(page)
    checkpoint('row_identities_tagged')

    // PickEm: pick "Houston Astros" (away) while still pregame -- wins
    // per the mock's final stage, tests the full pending -> correct path.
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

    // Two poll cycles: first brings hou-tex live, second brings it final.
    await page.evaluate(() => new Promise(r => setTimeout(r, 16000)))
    checkpoint('first_poll_wait_complete')
    await page.evaluate(() => new Promise(r => setTimeout(r, 16000)))
    checkpoint('second_poll_wait_complete')

    // Transition/DOM-identity checks run BEFORE any collapse testing --
    // collapsing a group removes its rows from the DOM by design, which
    // would make these checks fail for reasons unrelated to reconcile().
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

    await page.screenshot({ path: `outbox/reconciliation-check-after-${timestamp}.png` })

    // Collapse testing LAST, after every other check that needs the
    // rows actually present in the DOM.
    await page.click('[class*="sportLabel"]')
    checkpoint('mlb_group_clicked')
    const collapsedImmediately = await page.evaluate(() => {
      const rows = document.querySelectorAll('[class*="gameRow"]')
      return rows.length === 0
    })
    manifest.collapsedImmediately = collapsedImmediately
    checkpoint('collapse_checked')

    await page.evaluate(() => new Promise(r => setTimeout(r, 16000)))
    checkpoint('third_poll_wait_for_collapse_persistence')
    const collapsedAfterPoll = await page.evaluate(() => {
      const rows = document.querySelectorAll('[class*="gameRow"]')
      return rows.length === 0
    })
    manifest.collapsedAfterPoll = collapsedAfterPoll
    checkpoint('collapse_persistence_checked', { collapsedImmediately, collapsedAfterPoll })

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
