// Real browser verification of docs/EXPERIMENT-live-reconciliation.md's
// core claim: does deskStore's reconcile() keep GameRow identity stable
// across real poll cycles, including through a genuine pre->live status
// transition -- not just for byte-identical unrelated rows.
//
// Per Rule 90 (VERIFY-ARTIFACT-A): this produces a real JSON manifest
// with falsifiable fields, not a bare pass/fail assertion.
//
// 2026-07-25: full rewrite -- build the real production bundle, serve
// dist/ with plain Python http.server, use Playwright's page.route() for
// deterministic mock data. Confirmed working: real DOM node-reference
// identity check passed for both a changed and an unchanged game after
// fixing a real bug in DeskCard's own <Switch> (was checking
// deskData.loading, which flips true on every refetch and was masking
// deskStore's correct behavior underneath). See
// docs/EXPERIMENT-live-reconciliation.md for the full resolution chain.
//
// Removed the mount-badge check (all_mount_counts_stayed_at_m1) from
// pass/fail criteria this pass: that debug badge only renders in dev
// mode (import.meta.env.DEV), and this harness deliberately tests the
// production build, where it structurally cannot exist -- it was
// reporting a false negative on an empty array, not a real failure.
// Badges are still read and included in the manifest for reference; the
// DOM node-identity check is a strictly stronger version of the same
// underlying claim and is what actually gates pass/fail now.

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
  } catch { /* best effort -- do not let logging itself crash the run */ }
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

function mockContextResponse(pollCount) {
  const houTexLive = pollCount >= 2
  return {
    ok: true,
    date: '2026-07-25',
    games: {
      regular: [
        { id: '2026-07-25-mlb-nym-phi', sport: 'MLB', home: 'Philadelphia Phillies', away: 'NY Mets', home_score: 4, away_score: 2, venue: 'Citizens Bank Park', finalized_at: '2026-07-25T02:15:00Z', went_to_ot: null },
        { id: '2026-07-25-mlb-hou-tex', sport: 'MLB', home: 'Texas Rangers', away: 'Houston Astros', home_score: houTexLive ? 1 : null, away_score: houTexLive ? 0 : null, venue: 'Globe Life Field', finalized_at: null, went_to_ot: null },
      ],
      postseason: [],
    },
    briefs: [], series: [], standings: [],
  }
}

function mockNewspaperResponse() {
  return { ok: true, date: '2026-07-25', recap_date: '2026-07-24', generated_at: '2026-07-25T06:00:00Z', morning_report: 'Test data.', pick: { ranked: [] } }
}

async function readMountBadges(page) {
  return page.evaluate(() => Array.from(document.querySelectorAll('[class*="mountDebug"]')).map(el => el.textContent.trim()))
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

    const initialBadges = await readMountBadges(page)
    const initialHouTex = await readHouTexState(page)
    manifest.initialBadges = initialBadges
    manifest.initialHouTexState = initialHouTex
    checkpoint('initial_state_read', { initialBadges, initialHouTex })
    await page.screenshot({ path: `outbox/reconciliation-check-initial-${timestamp}.png` })
    checkpoint('initial_screenshot_taken')

    await tagRowIdentities(page)
    checkpoint('row_identities_tagged')

    await page.evaluate(async () => {
      await new Promise(r => setTimeout(r, 16000))
    })
    checkpoint('poll_wait_complete')

    const afterBadges = await readMountBadges(page)
    const afterHouTex = await readHouTexState(page)
    const identityCheck = await checkRowIdentities(page)
    manifest.afterBadges = afterBadges
    manifest.afterHouTexState = afterHouTex
    manifest.domIdentityCheck = identityCheck
    manifest.pollCount = pollCount
    checkpoint('after_state_read', { afterBadges, afterHouTex, pollCount })
    await page.screenshot({ path: `outbox/reconciliation-check-after-${timestamp}.png` })
    checkpoint('after_screenshot_taken')

    await browser.close()
    checkpoint('browser_closed')

    // Note: mount-badge data (initialBadges/afterBadges) is still
    // captured above for reference, but deliberately NOT included as a
    // pass/fail check -- see file header for why.

    const houTexTransitioned = initialHouTex?.text.includes('—') && !afterHouTex?.text.includes('—') && afterHouTex?.statusClass?.includes('live')
    manifest.checks.push({ name: 'houtex_transitioned_pre_to_live', pass: !!houTexTransitioned, initial: initialHouTex, after: afterHouTex })

    const allNodesReused = identityCheck.rows.length > 0 && identityCheck.rows.every(r => r.stillConnected && r.sameNodeReference)
    manifest.checks.push({ name: 'dom_node_references_reused_not_remounted', pass: allNodesReused, detail: identityCheck })

    const noRowsPhysicallyRemoved = identityCheck.removedGameRows.length === 0
    manifest.checks.push({ name: 'no_gamerow_nodes_removed_from_dom', pass: noRowsPhysicallyRemoved, removedGameRows: identityCheck.removedGameRows })

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
