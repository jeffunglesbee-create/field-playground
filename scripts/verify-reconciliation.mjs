// Real browser verification of docs/EXPERIMENT-live-reconciliation.md's
// core claim: does deskStore's reconcile() keep GameRow mount counts at 1
// across real poll cycles, including through a genuine pre->live status
// transition (hou-tex, via vite.config.js's mockRelay second-request
// branch) -- not just for byte-identical unrelated rows.
//
// Per Rule 90 (VERIFY-ARTIFACT-A): this produces a real JSON manifest
// with falsifiable fields, not a bare pass/fail assertion.

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

    // Wait past the second poll cycle -- mockRelay's second request flips
    // hou-tex from pregame to live.
    await page.waitForTimeout(POLL_INTERVAL_MS * 2 + 3000)

    const afterBadges = await readMountBadges(page)
    const afterHouTex = await readHouTexState(page)
    manifest.afterBadges = afterBadges
    manifest.afterHouTexState = afterHouTex
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
