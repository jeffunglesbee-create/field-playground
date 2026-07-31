// Regression probe for the real bug found 2026-07-31 (user report:
// "soundboard doesn't play live"). Root cause: DramaSoundscape's
// transition-detection logic was a bare `createMemo(() => {...})` whose
// return value nothing ever read -- confirmed via an isolated solid-js
// core test (no DOM) that an unread memo runs exactly once at creation
// and never re-runs on subsequent dependency changes. Fixed by
// switching to `createEffect`, which is push-based and always re-runs
// when its tracked dependencies change.
//
// scripts/probe-soundscape-cdn-load.mjs already covers the PREVIEW
// buttons (manual triggers) against the real deployed site -- it does
// NOT exercise the live polling-driven path at all, which is exactly
// how this bug shipped unnoticed. This probe covers that gap
// specifically: real dev server (this repo's OWN `npm run dev`, not
// the deployed site -- the deployed site's real relay data can't be
// staged into a deterministic transition sequence), real browser, real
// 15s polls, watching for all six real cues to actually appear in the
// component's own log over the mock's staged transition ladder
// (vite.config.js's context() -- see its own comment for the exact
// schedule, counts 5-8).

import { chromium } from 'playwright'
import { mkdirSync, writeFileSync } from 'node:fs'

mkdirSync('outbox', { recursive: true })
const stamp = new Date().toISOString().replace(/[:.]/g, '-')
const outPath = 'outbox/soundscape-live-triggers-probe-' + stamp + '.txt'
const out = []
const log = s => { out.push(s); console.log(s); try { writeFileSync(outPath, out.join('\n')) } catch {} }

const BASE = process.env.SOUNDSCAPE_PROBE_BASE || 'http://localhost:5173'
const POLL_MS = 15000
// Mock's ladder finishes staging by request count 8 (see vite.config.js) --
// request 1 fires at mount, so this needs ~9 real poll cycles of headroom.
const MAX_TICKS = 11

async function main() {
  log('probe_at: ' + new Date().toISOString())
  log('purpose: does DramaSoundscape\'s LIVE polling-driven trigger path actually fire real cues,')
  log('  not just the on-demand preview buttons (which a separate probe already covers)?')
  log('base: ' + BASE)
  log('')

  // Real CI (this probe's own workflow) downloads its own browser via
  // `playwright install` and needs no override. Local sandboxed dev
  // environments that pre-install Chromium elsewhere (this repo's own
  // CLAUDE.md notes one) can point PLAYWRIGHT_CHROMIUM_PATH at it.
  const launchOpts = process.env.PLAYWRIGHT_CHROMIUM_PATH ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH } : {}
  const browser = await chromium.launch(launchOpts)
  const page = await browser.newPage()
  // HealthPanel deliberately throws-and-catches on every mount (an
  // unattended self-test, see its own header comment) -- a real,
  // permanent, unrelated console error in every environment, not
  // something this probe should ever fail on.
  const errors = []
  page.on('pageerror', e => errors.push('pageerror: ' + e.message))
  page.on('console', m => { if (m.type() === 'error' && !m.text().includes('health-check throw')) errors.push('console.error: ' + m.text()) })

  await page.goto(BASE, { waitUntil: 'networkidle' })

  const gamesTab = page.locator('button', { hasText: 'Games' }).first()
  if (await gamesTab.count()) await gamesTab.click()
  await page.waitForTimeout(300)

  async function logEntries() {
    return page.evaluate(() => {
      const header = [...document.querySelectorAll('span')].find(s => s.textContent === 'Drama Soundscape')
      if (!header) return null
      let root = header
      while (root && !root.className?.toString().includes('root')) root = root.parentElement
      if (!root) return null
      return [...root.querySelectorAll('li')].map(li => li.textContent.trim())
    })
  }

  const expected = [
    { icon: '🫠', name: 'lead change' },
    { icon: '🎢', name: 'comeback' },
    { icon: '📉', name: 'blowout' },
    { icon: '🔔', name: 'new hottest' },
    { icon: '⏰', name: 'extra frames' },
    { icon: '🎉', name: 'dramatic final' },
  ]

  let seen = new Set()
  for (let tick = 0; tick <= MAX_TICKS; tick++) {
    const entries = await logEntries()
    if (entries === null) { log('FAILED: DramaSoundscape not found on the page at all'); await browser.close(); return }
    for (const e of expected) if (entries.some(x => x.startsWith(e.icon))) seen.add(e.icon)
    log('tick ' + tick + ': ' + seen.size + '/6 real cues seen so far')
    if (seen.size === 6) break
    if (tick < MAX_TICKS) await page.waitForTimeout(POLL_MS + 200)
  }

  log('')
  log('=== RESULT ===')
  for (const e of expected) log('  ' + e.icon + ' ' + e.name + ': ' + (seen.has(e.icon) ? 'FIRED' : 'MISSING'))
  log('')
  log('console/page errors: ' + errors.length)
  for (const e of errors.slice(0, 10)) log('  ' + e.slice(0, 200))

  log('')
  log('=== VERDICT ===')
  if (seen.size === 6 && errors.length === 0) {
    log('CONFIRMED: all 6 live-polling-driven cues actually fired, real transitions, real DOM log entries -- not the preview buttons, the real path.')
  } else {
    log('FAILED: ' + (6 - seen.size) + ' cue(s) never fired via the live polling path, or errors occurred. This is exactly the class of bug that shipped silently before -- do not dismiss as flaky.')
    process.exitCode = 1
  }

  await browser.close()
}

main().catch(e => { log('SCRIPT FAILED: ' + String(e)); process.exit(1) })
