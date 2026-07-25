// Real browser verification of docs/EXPERIMENT-live-reconciliation.md's
// core claim: does deskStore's reconcile() keep GameRow identity stable
// across real poll cycles, including through a genuine pre->live status
// transition -- not just for byte-identical unrelated rows.
//
// Per Rule 90 (VERIFY-ARTIFACT-A): this produces a real JSON manifest
// with falsifiable fields, not a bare pass/fail assertion.
//
// 2026-07-25: full rewrite after three straight CI failures/hangs using
// the previous design (spawn `npm run dev` as a background process, poll
// for readiness, rely on mockRelay()'s Vite dev-server-only plugin for
// deterministic data). That pattern is inherently fragile in an ephemeral
// CI runner -- confirmed by testing a fresh workflow filename (ruling out
// a stale GitHub Actions cache, which WAS real but wasn't the whole
// story) and still hitting a different hang later in the same run.
//
// New design: build the real production bundle (this has never once
// failed -- proven repeatedly), serve the static dist/ folder with a
// plain Python http.server (no Vite dev machinery, no file-watching, no
// HMR, nothing that behaves differently in CI than locally), and use
// Playwright's own page.route() to intercept the relay fetch calls
// directly at the network layer -- deterministic mock data without
// depending on Vite's dev-only plugin system at all. Fewer moving parts,
// each one independently proven reliable on its own.

import { spawn } from 'node:child_process'
import { mkdirSync, writeFileSync, existsSync } from 'node:fs'
import { chromium } from 'playwright'

const SERVE_PORT = 4173
const SERVE_URL = `http://localhost:${SERVE_PORT}`

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
  mkdirSync('outbox', { recursive: true })
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
  const manifest = { timestamp, checks: [] }

  if (!existsSync('dist/index.html')) {
    throw new Error('dist/index.html not found -- npm run build must run before this script')
  }

  const server = sh('python3', ['-m', 'http.server', String(SERVE_PORT), '--directory', 'dist'])
  let serverOutput = ''
  server.stdout.on('data', d => { serverOutput += d })
  server.stderr.on('data', d => { serverOutput += d })

  try {
    await waitForServer(SERVE_URL)

    const browser = await chromium.launch()
    const page = await browser.newPage()

    let pollCount = 0
    await page.route('**/context/date/**', route => {
      pollCount++
      route.fulfill({ json: mockContextResponse(pollCount) })
    })
    await page.route('**/analytics/newspaper/**', route => {
      route.fulfill({ json: mockNewspaperResponse() })
    })
    await page.route('**/wc/standings**', route => route.fulfill({ json: { groups: {} } }))
    await page.route('**/mlb-stats/standings**', route => route.fulfill({ json: { records: [] } }))
    await page.route('**/mls/stats/**', route => route.fulfill({ json: { tables: [{ entries: [] }] } }))

    await page.goto(SERVE_URL, { timeout: 15000 })
    await page.waitForSelector('[class*="gameRow"]', { timeout: 15000 })
    await page.waitForTimeout(500)

    const initialBadges = await readMountBadges(page)
    const initialHouTex = await readHouTexState(page)
    manifest.initialBadges = initialBadges
    manifest.initialHouTexState = initialHouTex
    await page.screenshot({ path: `outbox/reconciliation-check-initial-${timestamp}.png` })

    await tagRowIdentities(page)

    // Manually trigger a second poll via refetch, rather than wait 30s of
    // real time for App.jsx's own interval -- deterministic and fast.
    // deskStore's fetcher is driven by currentDate; the actual poll
    // interval remains real production code, untouched here -- this just
    // avoids the test needing to wait out the real 15s cadence twice.
    await page.evaluate(async () => {
      // App.jsx's setInterval will fire on its own within 15s in a real
      // browser tab -- give it real time rather than reach into module
      // internals from the test, since that would test the test's own
      // plumbing instead of the app's real polling code path.
      await new Promise(r => setTimeout(r, 16000))
    })

    const afterBadges = await readMountBadges(page)
    const afterHouTex = await readHouTexState(page)
    const identityCheck = await checkRowIdentities(page)
    manifest.afterBadges = afterBadges
    manifest.afterHouTexState = afterHouTex
    manifest.domIdentityCheck = identityCheck
    manifest.pollCount = pollCount
    await page.screenshot({ path: `outbox/reconciliation-check-after-${timestamp}.png` })

    await browser.close()

    const allStayedAtM1 = afterBadges.length > 0 && afterBadges.every(b => b === 'm1')
    manifest.checks.push({ name: 'all_mount_counts_stayed_at_m1', pass: allStayedAtM1, initialBadges, afterBadges })

    const houTexTransitioned = initialHouTex?.text.includes('—') && !afterHouTex?.text.includes('—') && afterHouTex?.statusClass?.includes('live')
    manifest.checks.push({ name: 'houtex_transitioned_pre_to_live', pass: !!houTexTransitioned, initial: initialHouTex, after: afterHouTex })

    const allNodesReused = identityCheck.rows.length > 0 && identityCheck.rows.every(r => r.stillConnected && r.sameNodeReference)
    manifest.checks.push({ name: 'dom_node_references_reused_not_remounted', pass: allNodesReused, detail: identityCheck })

    const noRowsPhysicallyRemoved = identityCheck.removedGameRows.length === 0
    manifest.checks.push({ name: 'no_gamerow_nodes_removed_from_dom', pass: noRowsPhysicallyRemoved, removedGameRows: identityCheck.removedGameRows })

    manifest.allPass = manifest.checks.every(c => c.pass)
    console.log(`Result: ${manifest.allPass ? 'ALL PASS ✓' : 'FAILURES DETECTED ✗'}`)
    console.log(JSON.stringify(manifest, null, 2))
    writeFileSync(`outbox/reconciliation-check-manifest-${timestamp}.json`, JSON.stringify(manifest, null, 2))
    if (!manifest.allPass) process.exitCode = 1
  } catch (err) {
    manifest.error = String(err)
    manifest.serverOutput = serverOutput.slice(-4000)
    writeFileSync(`outbox/reconciliation-check-manifest-${timestamp}.json`, JSON.stringify(manifest, null, 2))
    console.error('FAILED:', err)
    process.exitCode = 1
  } finally {
    server.kill()
  }
}

main()
