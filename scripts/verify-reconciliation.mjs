// Real browser verification of docs/EXPERIMENT-live-reconciliation.md's
// core claim: does deskStore's reconcile() keep GameRow mount counts at 1
// across real poll cycles, including through a genuine pre->live status
// transition (hou-tex, via vite.config.js's mockRelay second-request
// branch) -- not just for byte-identical unrelated rows.
//
// Per Rule 90 (VERIFY-ARTIFACT-A): this produces a real JSON manifest
// with falsifiable fields, not a bare pass/fail assertion.
//
// 2026-07-24: added a real MutationObserver-based check alongside the
// mount-counter one, per Claude Code's suggestion. The mount counter is a
// SolidJS-level proxy (depends on onMount firing correctly); this is a
// browser-level ground truth -- literal DOM node reference identity, not
// a metric derived from the framework's own lifecycle hooks. Two
// independent measurements of the same claim, not one restated twice.

import { spawn } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import { chromium } from 'playwright'

const DEV_PORT = 5173
const DEV_URL = `http://localhost:${DEV_PORT}`
const POLL_INTERVAL_MS = 15000

function sh(cmd, args) {
  return spawn(cmd, args, { stdio: 'pipe' })
}

async function waitForServer(url, timeoutMs = 20000) {
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(url)
      if (res.ok) return true
    } catch { /* not up yet */ }
    await new Promise(r => setTimeout(r, 500))
  }
  throw new Error(`dev server did not come up within ${timeoutMs}ms`)
}

async function readMountBadges(page) {
  return page.evaluate(() => {
    const badges = Array.from(document.querySelectorAll('[class*="mountDebug"]'))
    return badges.map(el => el.textContent.trim())
  })
}

async function readHouTexState(page) {
  return page.evaluate(() => {
    const rows = Array.from(document.querySelectorAll('[class*="gameRow"]'))
    for (const row of rows) {
      if (row.textContent.includes('Texas Rangers')) {
        const dot = row.querySelector('[class*="statusDot"]')
        return {
          text: row.textContent.trim(),
          statusClass: dot ? dot.className : null,
        }
      }
    }
    return null
  })
}

// Tags every current .gameRow DOM node with a real, unforgeable JS-level
// identity check: stash the actual node reference (not a copy, not a
// selector) on window, keyed by that row's visible matchup text. Later,
// re-querying by the SAME text and checking `===` against the stashed
// reference is a direct test of "is this literally the same DOM node,"
// not an inference from any framework-level signal.
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
    window.__mutationObserverRef = observer
  })
}

// Re-checks identity for every row tagged earlier: same key, is it the
// exact same node reference (proves reconciliation, no remount) or a
// different one (proves it remounted even though the key is unchanged)?
// Also reports any .gameRow the MutationObserver saw physically removed.
async function checkRowIdentities(page) {
  return page.evaluate(() => {
    const results = []
    for (const [key, oldNode] of window.__rowIdentity.entries()) {
      const stillConnected = oldNode.isConnected
      let sameNodeStillAtKey = false
      document.querySelectorAll('[class*="gameRow"]').forEach(row => {
        const matchupEl = row.querySelector('[class*="matchup"]')
        const rowKey = matchupEl ? matchupEl.textContent.trim() : row.textContent.trim().slice(0, 40)
        if (rowKey === key && row === oldNode) sameNodeStillAtKey = true
      })
      results.push({ key, stillConnected, sameNodeReference: sameNodeStillAtKey })
    }
    return { rows: results, removedGameRows: window.__removedGameRows || [] }
  })
}

async function main() {
  mkdirSync('outbox', { recursive: true })
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
  const manifest = { timestamp, checks: [] }

  const devServer = sh('npm', ['run', 'dev', '--', '--port', String(DEV_PORT)])
  let devOutput = ''
  devServer.stdout.on('data', d => { devOutput += d })
  devServer.stderr.on('data', d => { devOutput += d })

  try {
    await waitForServer(DEV_URL)

    const browser = await chromium.launch()
    const page = await browser.newPage()
    await page.goto(DEV_URL)
    await page.waitForSelector('[class*="gameRow"]', { timeout: 15000 })
    await page.waitForTimeout(500) // let onMount instrumentation settle

    const initialBadges = await readMountBadges(page)
    const initialHouTex = await readHouTexState(page)
    manifest.initialBadges = initialBadges
    manifest.initialHouTexState = initialHouTex
    await page.screenshot({ path: `outbox/reconciliation-check-initial-${timestamp}.png` })

    // Tag node identities + start the MutationObserver AFTER initial
    // render settles, so poll-cycle churn is what's actually measured.
    await tagRowIdentities(page)

    // Wait past the second poll cycle -- mockRelay's second request flips
    // hou-tex from pregame to live.
    await page.waitForTimeout(POLL_INTERVAL_MS * 2 + 3000)

    const afterBadges = await readMountBadges(page)
    const afterHouTex = await readHouTexState(page)
    const identityCheck = await checkRowIdentities(page)
    manifest.afterBadges = afterBadges
    manifest.afterHouTexState = afterHouTex
    manifest.domIdentityCheck = identityCheck
    await page.screenshot({ path: `outbox/reconciliation-check-after-${timestamp}.png` })

    await browser.close()

    // The actual falsifiable checks.
    const allStayedAtM1 = afterBadges.every(b => b === 'm1')
    manifest.checks.push({
      name: 'all_mount_counts_stayed_at_m1',
      pass: allStayedAtM1,
      initialBadges,
      afterBadges,
    })

    const houTexTransitioned = initialHouTex?.text.includes('—') &&
      !afterHouTex?.text.includes('—') &&
      afterHouTex?.statusClass?.includes('live')
    manifest.checks.push({
      name: 'houtex_transitioned_pre_to_live',
      pass: !!houTexTransitioned,
      initial: initialHouTex,
      after: afterHouTex,
    })

    // Ground-truth DOM check, independent of SolidJS's own onMount signal.
    const allNodesReused = identityCheck.rows.length > 0 &&
      identityCheck.rows.every(r => r.stillConnected && r.sameNodeReference)
    manifest.checks.push({
      name: 'dom_node_references_reused_not_remounted',
      pass: allNodesReused,
      detail: identityCheck,
    })

    const noRowsPhysicallyRemoved = identityCheck.removedGameRows.length === 0
    manifest.checks.push({
      name: 'no_gamerow_nodes_removed_from_dom',
      pass: noRowsPhysicallyRemoved,
      removedGameRows: identityCheck.removedGameRows,
    })

    manifest.allPass = manifest.checks.every(c => c.pass)
    console.log(`Result: ${manifest.allPass ? 'ALL PASS ✓' : 'FAILURES DETECTED ✗'}`)
    console.log(JSON.stringify(manifest, null, 2))

    writeFileSync(`outbox/reconciliation-check-manifest-${timestamp}.json`, JSON.stringify(manifest, null, 2))

    if (!manifest.allPass) process.exitCode = 1
  } catch (err) {
    manifest.error = String(err)
    manifest.devServerOutput = devOutput.slice(-4000)
    writeFileSync(`outbox/reconciliation-check-manifest-${timestamp}.json`, JSON.stringify(manifest, null, 2))
    console.error('FAILED:', err)
    process.exitCode = 1
  } finally {
    devServer.kill()
  }
}

main()
