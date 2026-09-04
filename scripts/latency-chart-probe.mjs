#!/usr/bin/env node
// scripts/latency-chart-probe.mjs — the latency line actually draws.
//
// Two things make this non-obvious to verify, and both are handled here rather
// than hoped away:
//
//   THE PANEL IS BEHIND A TAB. LatencyHistogram lives under
//   `activeTab() === 'system'` (App.jsx:392). A probe that loads the page and
//   looks for a canvas finds nothing and would report a working chart as broken
//   — measured locally before this script existed.
//
//   THE SERIES NEEDS REAL SAMPLES. fetchTiming instruments window.fetch, and
//   the chart needs >= 2 entries. Waiting for the relay is not deterministic
//   and, in a sandbox, not possible at all. So the probe issues its own fetches
//   from the page: they go through the same instrumented wrapper, and
//   recordSample runs on failures too (fetchTiming.js catch branch), so even a
//   404 against the local origin is a real sample by the app's own definition.
//
// Pass needs the canvas AND the aria summary. All-zero is a FAIL, not silence.

import { chromium } from '@playwright/test'
import { writeFileSync, mkdirSync } from 'fs'

const URL_ = process.env.PLAYGROUND_URL || 'http://localhost:4173/'
const EXEC = process.env.CHROMIUM_PATH || undefined
const RUN_ID = process.env.GITHUB_RUN_ID || String(Date.now())

const browser = await chromium.launch(EXEC ? { executablePath: EXEC } : {})
const page = await (await browser.newContext({ viewport: { width: 1280, height: 900 } })).newPage()
const errors = []
page.on('console', m => { if (m.type() === 'error') errors.push(m.text()) })

await page.goto(URL_, { waitUntil: 'domcontentloaded', timeout: 30000 })

// Seed the instrumented fetch. Same-origin so it resolves without egress.
const seeded = await page.evaluate(async () => {
  for (let i = 0; i < 4; i++) {
    try { await fetch(`/__probe_seed_${i}?t=${Date.now()}`) } catch (_) {}
  }
  return true
})

// Open the tab the panel lives under.
let tabbed = false
// role="tab", not "button" (Tabs/index.jsx:78). Looking for a button found
// nothing and the probe reported a working panel as unreachable.
try {
  await page.getByRole('tab', { name: /system/i }).first().click({ timeout: 5000 })
  tabbed = true
} catch (_) {
  try { await page.getByText(/^System/).first().click({ timeout: 5000 }); tabbed = true } catch (_) {}
}
await page.waitForTimeout(2500)

const r = await page.evaluate(() => {
  const el = document.querySelector('[class*=latencyChart]')
  return {
    panelInDom: !!document.querySelector('[class*=latencyHistogram], [class*=LatencyHistogram]') || !!el,
    mountPresent: !!el,
    canvases: el ? el.querySelectorAll('canvas').length : 0,
    uplotRoot: el ? !!el.querySelector('.uplot') : false,
    ariaLabel: el ? el.getAttribute('aria-label') : null,
  }
})

const manifest = { url: URL_, runId: RUN_ID, commit: process.env.GITHUB_SHA || null,
  timestamp: new Date().toISOString(), seeded, tabbed, ...r, consoleErrors: errors.slice(0, 8) }

mkdirSync('outbox', { recursive: true })
writeFileSync('outbox/latency-chart-manifest-latest.json', JSON.stringify(manifest, null, 2))
console.log(JSON.stringify(manifest, null, 2))
await browser.close()

const problems = []
if (!manifest.tabbed)       problems.push('could not open the system tab — the panel was never reachable, so nothing below was measured')
if (!manifest.panelInDom)   problems.push('the Relay Latency panel is not in the DOM')
if (!manifest.mountPresent) problems.push('no .latencyChart mount — fewer than 2 samples, or the Show guard is wrong')
if (manifest.canvases < 1)  problems.push('mount present but no canvas — uPlot did not draw')
if (!manifest.uplotRoot)    problems.push('no .uplot root inside the mount')
if (!manifest.ariaLabel)    problems.push('no aria-label — the canvas is silent to assistive tech')

if (problems.length) { console.error('\nFAIL:\n  - ' + problems.join('\n  - ')); process.exit(1) }
console.log('\nPASS: the latency line draws from real instrumented samples.')
